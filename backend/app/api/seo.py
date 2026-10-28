"""Search-engine plumbing served from the root of the site, not under /api.

A sitemap is the only practical way for a single-page app to tell a crawler which posts,
profiles and tags exist, so this builds one from the database on request and caches it at
the edge for an hour. The same list is what `python -m app.cli indexnow` sends to the IndexNow
engines, and /<key>.txt is the key file that protocol asks for (services/indexnow.py).
"""

from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import DbSession
from app.core.errors import NotFound
from app.models import Post, Series, Tag, User, UserSettings, post_tags
from app.repositories.posts import visible
from app.services import indexnow

router = APIRouter(include_in_schema=False)

# Google reads at most 50,000 URLs per sitemap; these caps keep the response small and
# the query cheap, while still covering everything a community this size publishes.
MAX_POSTS = 5000
MAX_PROFILES = 2000
MAX_TAGS = 500

# Paths exactly as the pages name themselves in their canonical link, so the two agree.
# The homepage and Explore change whenever someone posts; the rest only when we edit them.
LIVE_PAGES: list[tuple[str, str, str]] = [("/", "daily", "1.0"), ("/explore", "hourly", "0.9")]
FIXED_PAGES: list[tuple[str, str, str]] = [
    ("/projects", "daily", "0.7"),
    ("/developers", "weekly", "0.6"),
    ("/about", "monthly", "0.6"),
    ("/contact", "monthly", "0.5"),
    ("/register", "monthly", "0.5"),
]

# (path, last modified as YYYY-MM-DD or None, change frequency, priority)
Entry = tuple[str, str | None, str, str]


def sitemap_entries(db: Session) -> list[Entry]:
    # A post's date is when it was written or last edited. updated_at also moves with every
    # like and comment, and a lastmod that changes daily is one search engines learn to ignore.
    changed = func.coalesce(Post.edited_at, Post.created_at)
    # Only what a visitor can open: not posts hidden for review or by suspended accounts.
    posts = db.execute(select(Post.id, changed).where(visible()).order_by(desc(Post.created_at)).limit(MAX_POSTS)).all()
    newest = max((when for _, when in posts), default=None)
    newest_day = newest.date().isoformat() if newest else None

    entries: list[Entry] = [(path, newest_day, freq, priority) for path, freq, priority in LIVE_PAGES]
    entries += [(path, None, freq, priority) for path, freq, priority in FIXED_PAGES]
    entries += [(f"/posts/{post_id}", when.date().isoformat(), "weekly", "0.8") for post_id, when in posts]

    # Only accounts that asked to be findable, exactly as the privacy settings promise.
    profiles = db.scalars(
        select(User.username)
        .join(UserSettings, UserSettings.user_id == User.id)
        .where(User.is_active.is_(True), UserSettings.discoverable.is_(True))
        .order_by(desc(User.created_at))
        .limit(MAX_PROFILES)
    )
    entries += [(f"/u/{username}", None, "weekly", "0.5") for username in profiles]

    # Busiest tags first: those are the pages worth crawling often.
    tags = db.scalars(
        select(Tag.slug)
        .join(post_tags, post_tags.c.tag_id == Tag.id)
        .group_by(Tag.id)
        .order_by(desc(func.count(post_tags.c.post_id)))
        .limit(MAX_TAGS)
    )
    entries += [(f"/tags/{slug}", None, "daily", "0.4") for slug in tags]
    series_ids = db.scalars(
        select(Series.id)
        .where(Series.id.in_(select(Post.series_id).where(visible(), Post.series_id.is_not(None))))
        .limit(500)
    )
    entries += [(f"/series/{series_id}", None, "weekly", "0.6") for series_id in series_ids]
    return entries


def _url(path: str, lastmod: str | None, changefreq: str, priority: str) -> str:
    base = settings.frontend_url.rstrip("/")
    parts = [f"<loc>{escape(base + path)}</loc>"]
    if lastmod:
        parts.append(f"<lastmod>{lastmod}</lastmod>")
    parts.append(f"<changefreq>{changefreq}</changefreq>")
    parts.append(f"<priority>{priority}</priority>")
    return "<url>" + "".join(parts) + "</url>"


def build_sitemap(db: Session) -> str:
    body = "".join(_url(*entry) for entry in sitemap_entries(db))
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'


# HEAD too: crawlers and Search Console check the sitemap with it before downloading.
@router.api_route("/sitemap.xml", methods=["GET", "HEAD"])
def sitemap(db: DbSession) -> Response:
    return Response(
        build_sitemap(db),
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600, s-maxage=3600"},
    )


# IndexNow's proof of ownership: the key, as plain text, at the root of the site.
@router.api_route("/{name}.txt", methods=["GET", "HEAD"])
def indexnow_key(name: str) -> PlainTextResponse:
    if not indexnow.is_key(name):
        raise NotFound("Not found", "not_found")
    return PlainTextResponse(indexnow.key(), headers={"Cache-Control": "public, max-age=86400"})
