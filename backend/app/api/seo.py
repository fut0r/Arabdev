"""Search-engine plumbing served from the root of the site, not under /api.

A sitemap is the only practical way for a single-page app to tell a crawler which posts,
profiles and tags exist, so this builds one from the database on request and caches it at
the edge for an hour.
"""

from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import DbSession
from app.models import Post, Tag, User, UserSettings, post_tags
from app.utils.time import utcnow

router = APIRouter(include_in_schema=False)

# Google reads at most 50,000 URLs per sitemap; these caps keep the response small and
# the query cheap, while still covering everything a community this size publishes.
MAX_POSTS = 5000
MAX_PROFILES = 2000
MAX_TAGS = 500

STATIC_PAGES: list[tuple[str, str, str]] = [
    ("", "daily", "1.0"),
    ("/explore", "hourly", "0.9"),
    ("/login", "monthly", "0.3"),
    ("/register", "monthly", "0.5"),
]


def _url(path: str, lastmod: str | None = None, changefreq: str = "weekly", priority: str = "0.6") -> str:
    base = settings.frontend_url.rstrip("/")
    parts = [f"<loc>{escape(base + path)}</loc>"]
    if lastmod:
        parts.append(f"<lastmod>{lastmod}</lastmod>")
    parts.append(f"<changefreq>{changefreq}</changefreq>")
    parts.append(f"<priority>{priority}</priority>")
    return "<url>" + "".join(parts) + "</url>"


def build_sitemap(db: Session) -> str:
    today = utcnow().date().isoformat()
    urls = [_url(path, today, changefreq, priority) for path, changefreq, priority in STATIC_PAGES]

    posts = db.execute(
        select(Post.id, Post.updated_at).order_by(desc(Post.created_at)).limit(MAX_POSTS)
    ).all()
    urls += [
        _url(f"/posts/{post_id}", updated_at.date().isoformat(), "weekly", "0.8") for post_id, updated_at in posts
    ]

    # Only accounts that asked to be findable, exactly as the privacy settings promise.
    profiles = db.scalars(
        select(User.username)
        .join(UserSettings, UserSettings.user_id == User.id)
        .where(User.is_active.is_(True), UserSettings.discoverable.is_(True))
        .order_by(desc(User.created_at))
        .limit(MAX_PROFILES)
    )
    urls += [_url(f"/u/{username}", None, "weekly", "0.5") for username in profiles]

    # Busiest tags first: those are the pages worth crawling often.
    tags = db.scalars(
        select(Tag.slug)
        .join(post_tags, post_tags.c.tag_id == Tag.id)
        .group_by(Tag.id)
        .order_by(desc(func.count(post_tags.c.post_id)))
        .limit(MAX_TAGS)
    )
    urls += [_url(f"/tags/{slug}", None, "daily", "0.4") for slug in tags]

    body = "".join(urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'


@router.get("/sitemap.xml")
def sitemap(db: DbSession) -> Response:
    return Response(
        build_sitemap(db),
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600, s-maxage=3600"},
    )
