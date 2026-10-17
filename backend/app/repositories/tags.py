from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models import Interest, Post, Tag, post_tags
from app.repositories.posts import visible
from app.utils.text import escape_like, slugify_tag


def get_by_slug(db: Session, slug: str) -> Tag | None:
    return db.scalar(select(Tag).where(Tag.slug == slug))


def get_or_create(db: Session, names: list[str]) -> list[Tag]:
    tags: list[Tag] = []
    for name in names:
        slug = slugify_tag(name)
        if not slug or any(tag.slug == slug for tag in tags):
            continue
        tag = get_by_slug(db, slug)
        if tag is None:
            interest_id = db.scalar(select(Interest.id).where(Interest.slug == slug))
            tag = Tag(slug=slug, name=name.strip().lstrip("#")[:40], interest_id=interest_id)
            db.add(tag)
            db.flush()
        tags.append(tag)
    return tags


def stats_stmt(since: datetime | None = None) -> Select:
    """Tags with how many visible posts use them, most used first."""
    count = func.count(post_tags.c.post_id).label("posts_count")
    stmt = (
        select(Tag.id, Tag.slug, Tag.name, count)
        .join(post_tags, post_tags.c.tag_id == Tag.id)
        .join(Post, Post.id == post_tags.c.post_id)
        # Posts hidden for review, or by suspended accounts, do not make a tag popular.
        .where(visible())
        .group_by(Tag.id, Tag.slug, Tag.name)
        .order_by(count.desc(), Tag.slug)
    )
    if since is not None:
        stmt = stmt.where(Post.created_at >= since)
    return stmt


def search_stats_stmt(query: str) -> Select:
    pattern = f"%{escape_like(query)}%"
    slug_pattern = f"%{escape_like(slugify_tag(query) or query)}%"
    count = func.count(post_tags.c.post_id).label("posts_count")
    return (
        select(Tag.id, Tag.slug, Tag.name, count)
        .outerjoin(post_tags, post_tags.c.tag_id == Tag.id)
        .where(or_(Tag.name.ilike(pattern, escape="\\"), Tag.slug.ilike(slug_pattern, escape="\\")))
        .group_by(Tag.id, Tag.slug, Tag.name)
        .order_by(count.desc(), Tag.slug)
    )


def posts_count(db: Session, tag_id: int) -> int:
    return db.scalar(select(func.count()).select_from(post_tags).where(post_tags.c.tag_id == tag_id)) or 0
