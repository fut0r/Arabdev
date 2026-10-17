"""Search, tags and interests."""

from datetime import timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cache import cache_get, cache_set
from app.core.errors import NotFound
from app.models import Interest, Post, User
from app.repositories import posts as posts_repo
from app.repositories import tags as tags_repo
from app.repositories import users as users_repo
from app.schemas.common import Page
from app.schemas.misc import SearchOut, TagDetail
from app.schemas.post import TagStat
from app.schemas.user import InterestOut
from app.services import block_service, presenters
from app.utils.pagination import PageParams, count_rows, paginate_scalars
from app.utils.time import utcnow

SearchType = Literal["all", "posts", "users", "tags"]
PREVIEW_SIZE = 5


def _tag_page(db: Session, stmt, params: PageParams) -> Page[TagStat]:
    total = count_rows(db, stmt)
    rows = db.execute(stmt.limit(params.limit).offset(params.offset)).all() if total else []
    items = [TagStat(slug=row.slug, name=row.name, posts_count=row.posts_count) for row in rows]
    return Page.build(items, params.page, params.limit, total)


def search(db: Session, query: str, kind: SearchType, params: PageParams, viewer: User | None) -> SearchOut:
    query = " ".join(query.split())[:100]
    result = SearchOut(query=query, type=kind)
    if not query:
        return result

    viewer_id = viewer.id if viewer else None
    user_query = query.lstrip("@")
    tag_query = query.lstrip("#")
    per_type = params if kind != "all" else PageParams(page=1, limit=PREVIEW_SIZE)

    if kind in ("all", "posts") and query:
        stmt = posts_repo.search_stmt(query)
        hidden = block_service.not_blocked_by(viewer_id, Post.author_id)
        items, total = paginate_scalars(db, stmt if hidden is None else stmt.where(hidden), per_type)
        result.posts = Page.build(presenters.post_outs(db, items, viewer_id), per_type.page, per_type.limit, total)
    if kind in ("all", "users") and user_query:
        stmt = users_repo.search_stmt(user_query)
        hidden = block_service.not_blocked_by(viewer_id, User.id)
        items, total = paginate_scalars(db, stmt if hidden is None else stmt.where(hidden), per_type)
        result.users = Page.build(presenters.user_cards(db, items, viewer_id), per_type.page, per_type.limit, total)
    if kind in ("all", "tags") and tag_query:
        result.tags = _tag_page(db, tags_repo.search_stats_stmt(tag_query), per_type)
    return result


def popular_tags(db: Session, limit: int = 12, days: int = 30) -> list[TagStat]:
    cache_key = f"tags:popular:{limit}:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return [TagStat(**item) for item in cached]

    rows = db.execute(tags_repo.stats_stmt(utcnow() - timedelta(days=days)).limit(limit)).all()
    if not rows:
        rows = db.execute(tags_repo.stats_stmt(None).limit(limit)).all()
    tags = [TagStat(slug=row.slug, name=row.name, posts_count=row.posts_count) for row in rows]
    cache_set(cache_key, [tag.model_dump() for tag in tags], ttl_seconds=120)
    return tags


def tag_detail(db: Session, slug: str) -> TagDetail:
    tag = tags_repo.get_by_slug(db, slug.lower())
    if tag is None:
        raise NotFound("No posts use this tag yet", "tag_not_found")
    return TagDetail(
        slug=tag.slug,
        name=tag.name,
        posts_count=tags_repo.posts_count(db, tag.id),
        interest_slug=tag.interest.slug if tag.interest else None,
    )


def list_interests(db: Session) -> list[InterestOut]:
    cached = cache_get("interests:all")
    if cached is not None:
        return [InterestOut(**item) for item in cached]
    interests = [InterestOut.model_validate(i) for i in db.scalars(select(Interest).order_by(Interest.position))]
    cache_set("interests:all", [i.model_dump() for i in interests], ttl_seconds=3600)
    return interests
