from typing import Literal

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.errors import Forbidden, NotFound, UnprocessableEntity
from app.core.permissions import ensure_can_publish, is_admin
from app.models import Comment, Draft, Follow, Like, Post, Repost, User
from app.repositories import posts as posts_repo
from app.repositories import tags as tags_repo
from app.repositories import users as users_repo
from app.schemas.common import Page
from app.schemas.post import DraftOut, DraftWrite, PostCreate, PostOut, PostUpdate
from app.services import media_service, notification_service, presenters, ranking
from app.utils.html import html_to_text, sanitize_post_html
from app.utils.pagination import PageParams, paginate_scalars
from app.utils.time import utcnow

FeedTab = Literal["for_you", "following", "latest"]


# ---------------------------------------------------------------- reading


def get_post_or_404(db: Session, post_id: int) -> Post:
    post = posts_repo.get(db, post_id)
    if post is None:
        raise NotFound("This post doesn't exist or was deleted", "post_not_found")
    return post


def get_visible_post_or_404(db: Session, post_id: int, viewer: User | None) -> Post:
    """A post as this viewer may see it: one hidden for review stays reachable for its author and
    the moderators only, and a suspended author's posts for the moderators only."""
    post = get_post_or_404(db, post_id)
    is_author = viewer is not None and viewer.id == post.author_id
    if post.hidden_at is not None and not (is_author or is_admin(viewer)):
        raise NotFound("This post is being reviewed by the moderators", "post_under_review")
    if not post.author.is_active and not is_admin(viewer):
        raise NotFound("This post doesn't exist or was deleted", "post_not_found")
    return post


def get_post(db: Session, post_id: int, viewer: User | None) -> PostOut:
    post = get_visible_post_or_404(db, post_id, viewer)
    return presenters.post_outs(db, [post], viewer.id if viewer else None)[0]


def _page_of_posts(db: Session, stmt, params: PageParams, viewer: User | None) -> Page[PostOut]:
    items, total = paginate_scalars(db, stmt, params)
    outs = presenters.post_outs(db, items, viewer.id if viewer else None)
    return Page.build(outs, params.page, params.limit, total)


def _page_of_ranked(db: Session, ranked: list[Post], params: PageParams, viewer: User | None) -> Page[PostOut]:
    items = ranked[params.offset : params.offset + params.limit]
    outs = presenters.post_outs(db, items, viewer.id if viewer else None)
    return Page.build(outs, params.page, params.limit, len(ranked))


def _activity_page(
    db: Session, posts_filter, reposts_filter, params: PageParams, viewer: User | None
) -> Page[PostOut]:
    rows, total = posts_repo.activity_page(db, posts_filter, reposts_filter, params)
    posts_by_id = posts_repo.get_many(db, [post_id for post_id, _ in rows])
    ordered = [posts_by_id[post_id] for post_id, _ in rows if post_id in posts_by_id]

    # Posts that surface because of a repost show who reposted them.
    via_repost = [
        post.id
        for post, (_, activity_at) in zip(ordered, rows, strict=False)
        if activity_at is not None and activity_at > post.created_at
    ]
    reposter_ids = posts_repo.latest_reposters(db, via_repost, reposts_filter)
    reposters = users_repo.get_users_by_ids(db, reposter_ids.values())
    reposted_by = {post_id: reposters[user_id] for post_id, user_id in reposter_ids.items() if user_id in reposters}

    outs = presenters.post_outs(db, ordered, viewer.id if viewer else None, reposted_by)
    return Page.build(outs, params.page, params.limit, total)


def feed(db: Session, viewer: User | None, tab: FeedTab, params: PageParams, tag: str | None = None) -> Page[PostOut]:
    if tag:
        return _page_of_posts(db, posts_repo.tag_stmt(tag), params, viewer)
    if viewer is None or tab == "latest":
        return _page_of_posts(db, posts_repo.latest_stmt(), params, viewer)
    if tab == "following":
        followed = select(Follow.followee_id).where(Follow.follower_id == viewer.id)
        return _activity_page(
            db,
            or_(Post.author_id == viewer.id, Post.author_id.in_(followed)),
            or_(Repost.user_id == viewer.id, Repost.user_id.in_(followed)),
            params,
            viewer,
        )
    return _page_of_ranked(db, ranking.for_you(db, viewer), params, viewer)


def trending(db: Session, viewer: User | None, params: PageParams, days: int = 7) -> Page[PostOut]:
    ranked = ranking.trending(db, days)
    if ranked:
        return _page_of_ranked(db, ranked, params, viewer)
    # A quiet week: fall back to the all-time ranking rather than an empty page.
    return _page_of_posts(db, posts_repo.trending_stmt(None), params, viewer)


def user_activity(db: Session, username: str, viewer: User | None, params: PageParams) -> Page[PostOut]:
    user = users_repo.get_by_username(db, username)
    if user is None or not user.is_active:
        raise NotFound("This account doesn't exist", "user_not_found")
    return _activity_page(db, Post.author_id == user.id, Repost.user_id == user.id, params, viewer)


def bookmarks(db: Session, viewer: User, params: PageParams) -> Page[PostOut]:
    return _page_of_posts(db, posts_repo.bookmarks_stmt(viewer.id), params, viewer)


# ---------------------------------------------------------------- writing


def _prepare_content(content_html: str) -> tuple[str, str]:
    clean_html = sanitize_post_html(content_html)
    text = html_to_text(clean_html)
    if not text.strip():
        raise UnprocessableEntity("Write something before publishing", "post_empty", field="content_html")
    return clean_html, text


def _attach_image(db: Session, author: User, media_id: int | None) -> int | None:
    if media_id is None:
        return None
    return media_service.get_owned_media(db, author, media_id, "post_image").id


def create_post(db: Session, author: User, data: PostCreate) -> PostOut:
    ensure_can_publish(author)
    content_html, content_text = _prepare_content(data.content_html)
    post = Post(
        author_id=author.id,
        title=data.title,
        content_html=content_html,
        content_text=content_text,
        link_url=data.link_url,
        image_media_id=_attach_image(db, author, data.image_media_id),
        tags=tags_repo.get_or_create(db, data.tags),
    )
    db.add(post)
    db.flush()

    if data.draft_id is not None:
        draft = db.get(Draft, data.draft_id)
        if draft is not None and draft.author_id == author.id:
            db.delete(draft)

    notification_service.notify_mentions(db, text=content_text, actor_id=author.id, post_id=post.id)
    db.commit()
    db.refresh(post)
    return presenters.post_outs(db, [post], author.id)[0]


def _ensure_author(post: Post, user: User) -> None:
    if post.author_id != user.id:
        raise Forbidden("You can only change your own posts", "not_post_author")


def update_post(db: Session, user: User, post_id: int, data: PostUpdate) -> PostOut:
    post = get_post_or_404(db, post_id)
    _ensure_author(post, user)
    ensure_can_publish(user)
    content_html, content_text = _prepare_content(data.content_html)
    previous_image = post.image_media_id

    post.title = data.title
    post.content_html = content_html
    post.content_text = content_text
    post.link_url = data.link_url
    post.image_media_id = _attach_image(db, user, data.image_media_id)
    post.tags = tags_repo.get_or_create(db, data.tags)
    post.edited_at = utcnow()
    db.flush()
    if previous_image != post.image_media_id:
        media_service.delete_if_orphaned(db, previous_image)
    db.commit()
    db.refresh(post)
    return presenters.post_outs(db, [post], user.id)[0]


def delete_post(db: Session, user: User, post_id: int) -> None:
    post = get_post_or_404(db, post_id)
    if post.author_id != user.id and not is_admin(user):
        raise Forbidden("You can only delete your own posts", "not_post_author")
    remove_post(db, post)
    db.commit()


def remove_post(db: Session, post: Post) -> None:
    """Delete a post and its image. The caller commits."""
    image_id = post.image_media_id
    db.delete(post)
    db.flush()
    media_service.delete_if_orphaned(db, image_id)


def recount(db: Session, post_ids: list[int]) -> None:
    """Recompute denormalized counters, e.g. after deleting a comment thread or an account."""
    if not post_ids:
        return
    db.execute(
        update(Post)
        .where(Post.id.in_(post_ids))
        .values(
            likes_count=select(func.count()).select_from(Like).where(Like.post_id == Post.id).scalar_subquery(),
            comments_count=select(func.count())
            .select_from(Comment)
            .where(Comment.post_id == Post.id)
            .scalar_subquery(),
            reposts_count=select(func.count()).select_from(Repost).where(Repost.post_id == Post.id).scalar_subquery(),
        )
        .execution_options(synchronize_session=False)
    )


# ---------------------------------------------------------------- drafts


def list_drafts(db: Session, user: User, params: PageParams) -> Page[DraftOut]:
    stmt = select(Draft).where(Draft.author_id == user.id).order_by(Draft.updated_at.desc())
    items, total = paginate_scalars(db, stmt, params)
    return Page.build([presenters.draft_out(d) for d in items], params.page, params.limit, total)


def _get_own_draft(db: Session, user: User, draft_id: int) -> Draft:
    draft = db.get(Draft, draft_id)
    if draft is None or draft.author_id != user.id:
        raise NotFound("Draft not found", "draft_not_found")
    return draft


def get_draft(db: Session, user: User, draft_id: int) -> DraftOut:
    return presenters.draft_out(_get_own_draft(db, user, draft_id))


def _apply_draft(db: Session, user: User, draft: Draft, data: DraftWrite) -> None:
    draft.title = data.title
    draft.content_html = sanitize_post_html(data.content_html)
    draft.link_url = data.link_url
    draft.image_media_id = _attach_image(db, user, data.image_media_id)
    draft.tag_names = list(data.tags)


def create_draft(db: Session, user: User, data: DraftWrite) -> DraftOut:
    draft = Draft(author_id=user.id)
    _apply_draft(db, user, draft, data)
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return presenters.draft_out(draft)


def update_draft(db: Session, user: User, draft_id: int, data: DraftWrite) -> DraftOut:
    draft = _get_own_draft(db, user, draft_id)
    _apply_draft(db, user, draft, data)
    draft.updated_at = utcnow()
    db.commit()
    db.refresh(draft)
    return presenters.draft_out(draft)


def delete_draft(db: Session, user: User, draft_id: int) -> None:
    draft = _get_own_draft(db, user, draft_id)
    image_id = draft.image_media_id
    db.delete(draft)
    db.flush()
    media_service.delete_if_orphaned(db, image_id)
    db.commit()
