"""Likes, bookmarks and reposts. All operations are idempotent: liking twice is a no-op."""

from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import BadRequest
from app.core.permissions import ensure_can_publish
from app.models import Bookmark, Like, Post, Repost, User
from app.repositories import posts as posts_repo
from app.schemas.post import PostCounters
from app.services import notification_service
from app.services.post_service import get_post_or_404, get_visible_post_or_404


def _counters(db: Session, user: User, post: Post) -> PostCounters:
    db.refresh(post)
    liked, bookmarked, reposted = posts_repo.viewer_state(db, user.id, [post.id])
    return PostCounters(
        post_id=post.id,
        liked=post.id in liked,
        bookmarked=post.id in bookmarked,
        reposted=post.id in reposted,
        likes_count=post.likes_count,
        comments_count=post.comments_count,
        reposts_count=post.reposts_count,
    )


def _add(db: Session, model, user: User, post: Post, counter: str | None) -> bool:
    if db.get(model, (user.id, post.id)) is not None:
        return False
    db.add(model(user_id=user.id, post_id=post.id))
    try:
        db.flush()
    except IntegrityError:  # A concurrent request got there first.
        db.rollback()
        return False
    if counter:
        column = getattr(Post, counter)
        db.execute(update(Post).where(Post.id == post.id).values({counter: column + 1}))
    return True


def _remove(db: Session, model, user: User, post: Post, counter: str | None) -> bool:
    result = db.execute(delete(model).where(model.user_id == user.id, model.post_id == post.id))
    if result.rowcount and counter:
        column = getattr(Post, counter)
        db.execute(update(Post).where(Post.id == post.id, column > 0).values({counter: column - 1}))
    return bool(result.rowcount)


def like(db: Session, user: User, post_id: int) -> PostCounters:
    post = get_visible_post_or_404(db, post_id, user)
    if _add(db, Like, user, post, "likes_count"):
        notification_service.notify(db, recipient_id=post.author_id, actor_id=user.id, kind="like", post_id=post.id)
    db.commit()
    return _counters(db, user, post)


def unlike(db: Session, user: User, post_id: int) -> PostCounters:
    post = get_post_or_404(db, post_id)
    if _remove(db, Like, user, post, "likes_count"):
        notification_service.withdraw(
            db, recipient_id=post.author_id, actor_id=user.id, kind="like", post_id=post.id
        )
    db.commit()
    return _counters(db, user, post)


def bookmark(db: Session, user: User, post_id: int) -> PostCounters:
    post = get_visible_post_or_404(db, post_id, user)
    _add(db, Bookmark, user, post, None)
    db.commit()
    return _counters(db, user, post)


def unbookmark(db: Session, user: User, post_id: int) -> PostCounters:
    post = get_post_or_404(db, post_id)
    _remove(db, Bookmark, user, post, None)
    db.commit()
    return _counters(db, user, post)


def repost(db: Session, user: User, post_id: int) -> PostCounters:
    ensure_can_publish(user)
    post = get_visible_post_or_404(db, post_id, user)
    if post.author_id == user.id:
        raise BadRequest("You can't repost your own post", "cannot_repost_own")
    if _add(db, Repost, user, post, "reposts_count"):
        notification_service.notify(
            db, recipient_id=post.author_id, actor_id=user.id, kind="repost", post_id=post.id
        )
    db.commit()
    return _counters(db, user, post)


def unrepost(db: Session, user: User, post_id: int) -> PostCounters:
    post = get_post_or_404(db, post_id)
    if _remove(db, Repost, user, post, "reposts_count"):
        notification_service.withdraw(
            db, recipient_id=post.author_id, actor_id=user.id, kind="repost", post_id=post.id
        )
    db.commit()
    return _counters(db, user, post)
