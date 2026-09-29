from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import Forbidden, NotFound, UnprocessableEntity
from app.core.permissions import ensure_can_publish
from app.models import Comment, Post, User
from app.repositories import users as users_repo
from app.schemas.comment import CommentCreate, CommentOut, ReplyOut
from app.schemas.common import Page
from app.services import notification_service, presenters
from app.services.post_service import get_visible_post_or_404, recount
from app.utils.pagination import PageParams, paginate_scalars


def list_for_post(db: Session, post_id: int, viewer: User | None, params: PageParams) -> Page[CommentOut]:
    post = get_visible_post_or_404(db, post_id, viewer)
    stmt = (
        select(Comment)
        .where(Comment.post_id == post.id)
        .order_by(Comment.created_at.asc(), Comment.id.asc())
    )
    items, total = paginate_scalars(db, stmt, params)
    viewer_id = viewer.id if viewer else None
    outs = [presenters.comment_out(c, viewer_id, post.author_id) for c in items]
    return Page.build(outs, params.page, params.limit, total)


def list_replies_by_user(db: Session, username: str, viewer: User | None, params: PageParams) -> Page[ReplyOut]:
    user = users_repo.get_by_username(db, username)
    if user is None or not user.is_active:
        raise NotFound("This account doesn't exist", "user_not_found")
    stmt = (
        select(Comment)
        .where(Comment.author_id == user.id)
        .order_by(Comment.created_at.desc(), Comment.id.desc())
    )
    items, total = paginate_scalars(db, stmt, params)
    viewer_id = viewer.id if viewer else None
    return Page.build([presenters.reply_out(c, viewer_id) for c in items], params.page, params.limit, total)


def create(db: Session, author: User, post_id: int, data: CommentCreate) -> CommentOut:
    ensure_can_publish(author)
    post = get_visible_post_or_404(db, post_id, author)
    parent: Comment | None = None
    if data.parent_id is not None:
        parent = db.get(Comment, data.parent_id)
        if parent is None or parent.post_id != post.id:
            raise UnprocessableEntity("The comment you're replying to no longer exists", "parent_invalid")

    comment = Comment(post_id=post.id, author_id=author.id, parent_id=parent.id if parent else None, content=data.content)
    db.add(comment)
    db.flush()
    db.execute(update(Post).where(Post.id == post.id).values(comments_count=Post.comments_count + 1))

    notified = {author.id}
    notification_service.notify(
        db, recipient_id=post.author_id, actor_id=author.id, kind="comment", post_id=post.id, comment_id=comment.id
    )
    notified.add(post.author_id)
    if parent is not None and parent.author_id not in notified:
        notification_service.notify(
            db, recipient_id=parent.author_id, actor_id=author.id, kind="comment", post_id=post.id, comment_id=comment.id
        )
        notified.add(parent.author_id)
    notification_service.notify_mentions(
        db, text=data.content, actor_id=author.id, post_id=post.id, comment_id=comment.id, skip=notified
    )
    db.commit()
    db.refresh(comment)
    return presenters.comment_out(comment, author.id, post.author_id)


def delete(db: Session, user: User, comment_id: int) -> None:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise NotFound("Comment not found", "comment_not_found")
    post = db.get(Post, comment.post_id)
    allowed = user.id == comment.author_id or (post is not None and user.id == post.author_id) or user.is_admin
    if not allowed:
        raise Forbidden("You can't delete this comment", "not_comment_author")
    db.delete(comment)
    db.flush()
    if post is not None:
        recount(db, [post.id])  # Replies are removed with their parent.
    db.commit()
