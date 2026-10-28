"""Public discovery and private reading tools, with ownership enforced here."""

from datetime import timedelta
from typing import Literal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import Forbidden, NotFound, UnprocessableEntity
from app.core.permissions import ensure_can_publish, is_admin
from app.models import (
    AcceptedAnswer,
    Bookmark,
    BookmarkCollection,
    Comment,
    Interest,
    Post,
    Series,
    Tag,
    TagFollow,
    User,
    UserSettings,
    post_tags,
)
from app.repositories import posts as posts_repo
from app.repositories import users as users_repo
from app.schemas.common import Page
from app.schemas.community import BookmarkWrite, CollectionOut, SeriesOut, SeriesWrite
from app.schemas.post import PostOut, TagStat
from app.services import block_service, presenters, spam_guard
from app.services.post_service import get_visible_post_or_404
from app.utils.pagination import PageParams, paginate_scalars
from app.utils.time import utcnow


def browse(
    db: Session,
    viewer: User | None,
    params: PageParams,
    *,
    sort: Literal["latest", "trending", "featured"] = "latest",
    days: int = 0,
    kind: str | None = None,
    language: str | None = None,
    unanswered: bool = False,
    series_id: int | None = None,
) -> Page[PostOut]:
    stmt = posts_repo.latest_stmt()
    if sort == "trending":
        since = utcnow() - timedelta(days=days) if days else None
        stmt = posts_repo.trending_stmt(since)
    elif sort == "featured":
        stmt = stmt.where(Post.featured.is_(True))
    if kind:
        stmt = stmt.where(Post.kind == kind)
    if language:
        stmt = stmt.where(Post.language.in_([language, "mul"]) if language != "mul" else Post.language == language)
    if unanswered:
        stmt = stmt.where(Post.kind == "question", Post.id.not_in(select(AcceptedAnswer.post_id)))
    if series_id:
        stmt = (
            stmt.where(Post.series_id == series_id).order_by(None).order_by(Post.series_order, Post.created_at, Post.id)
        )
    hidden = block_service.not_blocked_by(viewer.id if viewer else None, Post.author_id)
    if hidden is not None:
        stmt = stmt.where(hidden)
    items, total = paginate_scalars(db, stmt, params)
    return Page.build(presenters.post_outs(db, items, viewer.id if viewer else None), params.page, params.limit, total)


def developers(db: Session, viewer: User | None, params: PageParams, query: str = "", interest: str | None = None):
    stmt = (
        users_repo.search_stmt(query.strip())
        if query.strip()
        else select(User)
        .join(UserSettings)
        .where(User.is_active.is_(True), UserSettings.discoverable.is_(True))
        .order_by(User.created_at.desc(), User.id.desc())
    )
    if interest:
        stmt = stmt.where(User.interests.any(Interest.slug == interest))
    hidden = block_service.not_blocked_by(viewer.id if viewer else None, User.id)
    if hidden is not None:
        stmt = stmt.where(hidden)
    items, total = paginate_scalars(db, stmt, params)
    return Page.build(presenters.user_cards(db, items, viewer.id if viewer else None), params.page, params.limit, total)


def collection(db: Session, user: User, collection_id: int) -> BookmarkCollection:
    row = db.get(BookmarkCollection, collection_id)
    if row is None or row.user_id != user.id:
        raise NotFound("Collection not found", "collection_not_found")
    return row


def collections(db: Session, user: User) -> list[CollectionOut]:
    counts = dict(
        db.execute(
            select(Bookmark.collection_id, func.count())
            .where(Bookmark.user_id == user.id)
            .group_by(Bookmark.collection_id)
        ).all()
    )
    return [
        CollectionOut(id=row.id, name=row.name, posts_count=counts.get(row.id, 0))
        for row in db.scalars(
            select(BookmarkCollection)
            .where(BookmarkCollection.user_id == user.id)
            .order_by(BookmarkCollection.created_at, BookmarkCollection.id)
        )
    ]


def save_collection(db: Session, user: User, name: str, collection_id: int | None = None) -> CollectionOut:
    if collection_id is None:
        if (
            db.scalar(select(func.count()).select_from(BookmarkCollection).where(BookmarkCollection.user_id == user.id))
            or 0
        ) >= 50:
            raise UnprocessableEntity("You can have up to 50 collections", "collection_limit")
        row = BookmarkCollection(user_id=user.id, name=name)
        db.add(row)
    else:
        row = collection(db, user, collection_id)
        row.name = name
    db.commit()
    return next(item for item in collections(db, user) if item.id == row.id)


def remove_collection(db: Session, user: User, collection_id: int) -> None:
    db.delete(collection(db, user, collection_id))
    db.commit()  # ON DELETE SET NULL keeps its saved posts and notes.


def save_bookmark(db: Session, user: User, post_id: int, data: BookmarkWrite) -> PostOut:
    post = get_visible_post_or_404(db, post_id, user)
    if data.collection_id:
        collection(db, user, data.collection_id)
    row = db.get(Bookmark, (user.id, post_id))
    if row is None:
        row = Bookmark(user_id=user.id, post_id=post_id)
        db.add(row)
    row.collection_id = data.collection_id
    row.note = (data.note or "").strip() or None
    db.commit()
    return presenters.post_outs(db, [post], user.id)[0]


def series_out(db: Session, row: Series) -> SeriesOut:
    author = db.get(User, row.author_id)
    if author is None or not author.is_active:
        raise NotFound("Series not found", "series_not_found")
    count = db.scalar(select(func.count()).select_from(Post).where(Post.series_id == row.id, posts_repo.visible())) or 0
    return SeriesOut(
        id=row.id,
        title=row.title,
        description=row.description,
        author=presenters.user_summary(author),
        posts_count=count,
        created_at=row.created_at,
    )


def get_series(db: Session, series_id: int) -> SeriesOut:
    row = db.get(Series, series_id)
    if row is None:
        raise NotFound("Series not found", "series_not_found")
    return series_out(db, row)


def own_series(db: Session, user: User) -> list[SeriesOut]:
    return [
        series_out(db, row)
        for row in db.scalars(select(Series).where(Series.author_id == user.id).order_by(Series.created_at.desc()))
    ]


def save_series(db: Session, user: User, data: SeriesWrite, series_id: int | None = None) -> SeriesOut:
    ensure_can_publish(user)
    spam_guard.check_links(user, spam_guard.links_in(text=f"{data.title} {data.description or ''}"), "description")
    if series_id is None:
        if (db.scalar(select(func.count()).select_from(Series).where(Series.author_id == user.id)) or 0) >= 100:
            raise UnprocessableEntity("You can have up to 100 series", "series_limit")
        row = Series(author_id=user.id, title=data.title, description=data.description)
        db.add(row)
    else:
        row = db.get(Series, series_id)
        if row is None or row.author_id != user.id:
            raise Forbidden("You can only change your own series", "series_not_owned")
        row.title, row.description = data.title, data.description
    db.commit()
    return series_out(db, row)


def remove_series(db: Session, user: User, series_id: int) -> None:
    row = db.get(Series, series_id)
    if row is None or row.author_id != user.id:
        raise Forbidden("You can only change your own series", "series_not_owned")
    db.delete(row)
    db.commit()


def accept_answer(db: Session, user: User, post_id: int, comment_id: int | None) -> PostOut:
    post = get_visible_post_or_404(db, post_id, user)
    if post.author_id != user.id:
        raise Forbidden("Only the question's author can accept an answer", "not_post_author")
    ensure_can_publish(user)
    if post.kind != "question":
        raise UnprocessableEntity("Only questions have accepted answers", "not_question")
    if comment_id is not None:
        comment = db.get(Comment, comment_id)
        if comment is None or comment.post_id != post.id or not comment.author.is_active:
            raise NotFound("Answer not found", "comment_not_found")
        block_service.ensure_can_interact(db, user.id, comment.author_id)
    db.execute(delete(AcceptedAnswer).where(AcceptedAnswer.post_id == post.id))
    if comment_id is not None:
        db.add(AcceptedAnswer(post_id=post.id, comment_id=comment_id))
    db.commit()
    return presenters.post_outs(db, [post], user.id)[0]


def feature_post(db: Session, user: User, post_id: int, featured: bool) -> PostOut:
    if not is_admin(user):
        raise Forbidden("Only moderators choose featured posts", "forbidden")
    post = get_visible_post_or_404(db, post_id, user)
    post.featured = featured
    db.commit()
    return presenters.post_outs(db, [post], user.id)[0]


def follow_tag(db: Session, user: User, slug: str, following: bool) -> None:
    tag = db.scalar(select(Tag).where(Tag.slug == slug.lower()))
    if tag is None:
        raise NotFound("Tag not found", "tag_not_found")
    row = db.get(TagFollow, (user.id, tag.id))
    if following and row is None:
        if (db.scalar(select(func.count()).select_from(TagFollow).where(TagFollow.user_id == user.id)) or 0) >= 100:
            raise UnprocessableEntity("You can follow up to 100 tags", "tag_follow_limit")
        db.add(TagFollow(user_id=user.id, tag_id=tag.id))
    elif not following and row:
        db.delete(row)
    db.commit()


def followed_tags(db: Session, user: User) -> list[TagStat]:
    rows = db.execute(
        select(Tag, func.count(Post.id))
        .join(TagFollow, TagFollow.tag_id == Tag.id)
        .outerjoin(post_tags, post_tags.c.tag_id == Tag.id)
        .outerjoin(Post, (Post.id == post_tags.c.post_id) & posts_repo.visible())
        .where(TagFollow.user_id == user.id)
        .group_by(Tag.id)
        .order_by(Tag.slug)
    ).all()
    return [TagStat(slug=tag.slug, name=tag.name, posts_count=count) for tag, count in rows]
