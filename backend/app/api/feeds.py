"""RSS feeds, for feed readers and for anyone who wants new posts without visiting.

    /rss.xml                  the latest posts on ArabDev
    /u/<username>/rss.xml     one member's posts (only if they appear in search and suggestions)
    /tags/<slug>/rss.xml      posts with one tag

Each feed carries the newest 20 posts, with a short excerpt and a link to the full post.
"""

from email.utils import format_datetime
from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import DbSession
from app.core.errors import NotFound
from app.models import Post
from app.repositories import posts as posts_repo
from app.repositories import tags as tags_repo
from app.repositories import users as users_repo
from app.utils.html import excerpt
from app.utils.time import utcnow

router = APIRouter(include_in_schema=False)

FEED_SIZE = 20
CACHE = "public, max-age=600, s-maxage=600"


def _site(path: str = "") -> str:
    return settings.frontend_url.rstrip("/") + path


def _item(post: Post) -> str:
    url = _site(f"/posts/{post.id}")
    title = post.title or f"{post.author.display_name} on ArabDev"
    categories = "".join(f"<category>{escape(tag.slug)}</category>" for tag in post.tags)
    return (
        "<item>"
        f"<title>{escape(title)}</title>"
        f"<link>{escape(url)}</link>"
        f'<guid isPermaLink="true">{escape(url)}</guid>'
        f"<pubDate>{format_datetime(post.created_at)}</pubDate>"
        f"<dc:creator>{escape(post.author.display_name)} (@{escape(post.author.username)})</dc:creator>"
        f"<description>{escape(excerpt(post.content_text, 400))}</description>"
        f"{categories}"
        "</item>"
    )


def _feed(db: Session, stmt, *, title: str, description: str, path: str) -> Response:
    posts = list(db.scalars(stmt.limit(FEED_SIZE)).unique())
    built = format_datetime(posts[0].created_at if posts else utcnow())
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">'
        "<channel>"
        f"<title>{escape(title)}</title>"
        f"<link>{escape(_site(path))}</link>"
        f"<description>{escape(description)}</description>"
        "<language>ar</language>"
        f"<lastBuildDate>{built}</lastBuildDate>"
        f'<atom:link href="{escape(_site(path + ("/" if path else "") + "rss.xml"))}" rel="self" '
        'type="application/rss+xml"/>'
        f"{''.join(_item(post) for post in posts)}"
        "</channel></rss>"
    )
    return Response(body, media_type="application/rss+xml; charset=utf-8", headers={"Cache-Control": CACHE})


@router.api_route("/rss.xml", methods=["GET", "HEAD"])
def latest(db: DbSession) -> Response:
    return _feed(
        db,
        posts_repo.latest_stmt(),
        title="ArabDev",
        description="The latest posts from Arabic-speaking developers on ArabDev.",
        path="",
    )


@router.api_route("/u/{username}/rss.xml", methods=["GET", "HEAD"])
def member(username: str, db: DbSession) -> Response:
    user = users_repo.get_by_username(db, username)
    # Accounts that asked not to be made easier to find get no feed.
    if user is None or not user.is_active or not users_repo.get_settings(db, user).discoverable:
        raise NotFound("This feed doesn't exist", "feed_not_found")
    stmt = (
        select(Post)
        .where(posts_repo.visible(), Post.author_id == user.id)
        .order_by(Post.created_at.desc(), Post.id.desc())
    )
    return _feed(
        db,
        stmt,
        title=f"{user.display_name} on ArabDev",
        description=f"Posts by @{user.username} on ArabDev.",
        path=f"/u/{user.username}",
    )


@router.api_route("/tags/{slug}/rss.xml", methods=["GET", "HEAD"])
def tag(slug: str, db: DbSession) -> Response:
    slug = slug.lower()
    if tags_repo.get_by_slug(db, slug) is None:
        raise NotFound("This feed doesn't exist", "feed_not_found")
    return _feed(
        db,
        posts_repo.tag_stmt(slug),
        title=f"#{slug} on ArabDev",
        description=f"Posts tagged #{slug} on ArabDev.",
        path=f"/tags/{slug}",
    )
