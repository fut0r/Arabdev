"""Public pages that can be read without running JavaScript.

ArabDev is a single-page app: the server sends one HTML shell and the browser builds every page
from the API. A crawler that does not run scripts (most link previewers, several ad and search
bots) therefore saw an empty page carrying the homepage's title, whatever address it asked for.

For the pages worth finding (a post, a profile, a tag and Explore) this module writes the page's
own title, description, preview card and text into that same shell. The app starts exactly as it
did before and replaces the text the moment it loads, so readers and crawlers get the same
content; it is simply there before any script runs.

The text is built from plain text and escaped here, never from stored HTML.
"""

import json
import logging
import re
import time
import urllib.request
from dataclasses import dataclass
from html import escape
from pathlib import Path
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import BASE_DIR, settings
from app.core.errors import NotFound
from app.models import Comment, Post, User
from app.repositories import posts as posts_repo
from app.repositories import tags as tags_repo
from app.repositories import users as users_repo
from app.services.media_service import media_url
from app.services.post_service import get_visible_post_or_404
from app.utils.html import excerpt

logger = logging.getLogger("arabdev.pages")

SITE_NAME = "ArabDev"
LIST_SIZE = 20
MAX_COMMENTS = 30
MAX_TAGS = 20
MAX_POST_ID = 2**31 - 1  # the largest id the database column can hold

# Where the text goes inside the shell (see frontend/index.html).
_OPEN, _CLOSE = "<!--prerender-->", "<!--/prerender-->"

# Used only when the real shell cannot be read: it loads the app in the browser instead, so the
# page still works for people while the text below stays readable for crawlers.
_FALLBACK_SHELL = f"""<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>{SITE_NAME}</title>
    <meta name="description" content="" />
    <meta property="og:site_name" content="{SITE_NAME}" />
    <script>
      fetch('/app.html')
        .then(function (response) {{ return response.text(); }})
        .then(function (html) {{ document.open(); document.write(html); document.close(); }});
    </script>
  </head>
  <body>
    <div id="root"><div id="prerender">{_OPEN}{_CLOSE}</div></div>
  </body>
</html>
"""

FETCHED_SHELL_TTL = 300
FAILED_SHELL_TTL = 30
_shell: tuple[float, str, str] | None = None  # (good until, html, where it came from)


@dataclass
class Page:
    title: str  # without the site name
    description: str
    path: str  # the page's own address, e.g. /posts/12
    body: str = ""  # HTML built in this module: every piece of text in it is escaped
    og_type: str = "website"
    image: str | None = None
    json_ld: dict | None = None
    published_at: str | None = None
    author_name: str | None = None
    noindex: bool = False
    status: int = 200


# ---------------------------------------------------------------- the shell


def _shell_files() -> list[Path]:
    configured = [settings.spa_shell_path] if settings.spa_shell_path else []
    # backend/spa_shell.html is written by the frontend build on Vercel, where only backend/ ships
    # with the API; the second path covers a checkout that has both halves built side by side.
    return [*configured, BASE_DIR / "spa_shell.html", BASE_DIR.parent / "frontend" / "dist" / "app.html"]


def _fetch_shell() -> str | None:
    url = settings.spa_shell_url or settings.frontend_url.rstrip("/") + "/app.html"
    if not url.startswith(("http://", "https://")):
        return None
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "ArabDev-pages/1.0"})
        with urllib.request.urlopen(request, timeout=4) as response:  # noqa: S310 (our own address)
            html = response.read(512_000).decode("utf-8", "replace")
    except Exception:
        logger.warning("Could not fetch the app shell from %s", url, exc_info=True)
        return None
    return html if 'id="root"' in html else None


def load_shell() -> tuple[str, str]:
    """The built app shell, and where it came from: "file", "fetched" or "fallback"."""
    global _shell
    now = time.monotonic()
    if _shell is not None and _shell[0] > now:
        return _shell[1], _shell[2]
    for path in _shell_files():
        try:
            html = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if 'id="root"' in html:
            # A file belongs to this build and never changes while the process lives.
            _shell = (float("inf"), html, "file")
            return html, "file"
    fetched = _fetch_shell()
    if fetched is not None:
        _shell = (now + FETCHED_SHELL_TTL, fetched, "fetched")
        return fetched, "fetched"
    _shell = (now + FAILED_SHELL_TTL, _FALLBACK_SHELL, "fallback")
    return _FALLBACK_SHELL, "fallback"


def reset_shell_cache() -> None:
    global _shell
    _shell = None


# ---------------------------------------------------------------- writing into it


def _absolute(path: str) -> str:
    return path if path.startswith(("http://", "https://")) else settings.frontend_url.rstrip("/") + path


def _before_head_end(html: str, tag: str) -> str:
    return html.replace("</head>", f"    {tag}\n  </head>", 1)


def _set_meta(html: str, attribute: str, key: str, content: str) -> str:
    """Replace a meta tag's content, or add the tag when the shell has none."""
    value = escape(content, quote=True)
    pattern = re.compile(rf'(<meta\s+{attribute}="{re.escape(key)}"\s+content=")[^"]*(")', re.S)
    html, found = pattern.subn(lambda match: match.group(1) + value + match.group(2), html, count=1)
    return html if found else _before_head_end(html, f'<meta {attribute}="{key}" content="{value}" />')


def render(page: Page, shell: str) -> str:
    full_title = f"{page.title} · {SITE_NAME}" if page.title else SITE_NAME
    url = _absolute(page.path)
    html = re.sub(
        r"<title>.*?</title>", lambda _: f"<title>{escape(full_title)}</title>", shell, count=1, flags=re.S
    )
    html = _set_meta(html, "name", "description", page.description)
    html = _set_meta(html, "property", "og:title", full_title)
    html = _set_meta(html, "property", "og:description", page.description)
    html = _set_meta(html, "property", "og:type", page.og_type)
    html = _set_meta(html, "property", "og:url", url)
    html = _set_meta(html, "name", "twitter:title", full_title)
    html = _set_meta(html, "name", "twitter:description", page.description)
    if page.image:
        html = _set_meta(html, "property", "og:image", _absolute(page.image))
        html = _set_meta(html, "name", "twitter:image", _absolute(page.image))
        # The shell's size describes the default screenshot, not this picture.
        html = re.sub(r'\s*<meta\s+property="og:image:(?:width|height)"\s+content="[^"]*"\s*/?>', "", html)
    if page.published_at:
        html = _set_meta(html, "property", "article:published_time", page.published_at)
    if page.author_name:
        html = _set_meta(html, "property", "article:author", page.author_name)
    if page.noindex:
        html = _set_meta(html, "name", "robots", "noindex, nofollow")
    else:
        html = _before_head_end(html, f'<link rel="canonical" href="{escape(url, quote=True)}" />')
    if page.json_ld:
        # "<" is escaped so no text inside the data can close the script element.
        data = json.dumps(page.json_ld, ensure_ascii=False).replace("<", "\\u003c")
        html = _before_head_end(html, f'<script id="page-jsonld" type="application/ld+json">{data}</script>')

    start, end = html.find(_OPEN), html.find(_CLOSE)
    if start != -1 and end > start:
        return html[: start + len(_OPEN)] + page.body + html[end:]
    # A shell built before the markers existed: put the text at the start of the app's root.
    return re.sub(
        r'(<div id="root">)', lambda match: f'{match.group(1)}<div id="prerender">{page.body}</div>', html, count=1
    )


# ---------------------------------------------------------------- the text of each page


def _time(moment) -> str:
    return f'<time datetime="{moment.isoformat()}">{moment.date().isoformat()}</time>'


def _author_link(user: User) -> str:
    return f'<a href="/u/{quote(user.username)}">{escape(user.display_name)}</a>'


def _post_title(post: Post) -> str:
    return post.title or f"بقلم {post.author.display_name}"


def _paragraphs(text: str) -> str:
    return "".join(f'<p dir="auto">{escape(line)}</p>' for line in text.splitlines() if line.strip())


def _post_item(post: Post) -> str:
    return (
        "<article>"
        f'<h2 dir="auto"><a href="/posts/{post.id}">{escape(_post_title(post))}</a></h2>'
        f"<p>{_author_link(post.author)} · {_time(post.created_at)}</p>"
        f'<p dir="auto">{escape(excerpt(post.content_text, 280))}</p>'
        "</article>"
    )


def _post_list(posts: list[Post]) -> str:
    return "".join(_post_item(post) for post in posts)


def _more_links() -> str:
    return (
        '<nav aria-label="ArabDev"><p>'
        '<a href="/explore">استكشف المنشورات · Explore posts</a> · '
        '<a href="/about">عن ArabDev · About</a> · '
        '<a href="/contact">تواصل معنا · Contact</a>'
        "</p></nav>"
    )


def not_found(path: str, title: str = "هذه الصفحة غير موجودة") -> Page:
    return Page(
        title=title,
        description="هذه الصفحة غير موجودة أو حُذفت. This page does not exist or was removed.",
        path=path,
        body=f"<h1>{escape(title)}</h1><p>This page does not exist or was removed.</p>{_more_links()}",
        noindex=True,
        status=404,
    )


def post_page(db: Session, post_id: int) -> Page:
    path = f"/posts/{post_id}"
    try:
        if not 0 < post_id <= MAX_POST_ID:
            raise NotFound("This post doesn't exist or was deleted", "post_not_found")
        # Nobody is signed in here, so a post hidden for review or by a suspended author is "not found".
        post = get_visible_post_or_404(db, post_id, None)
    except NotFound:
        return not_found(path, "هذا المنشور غير موجود أو حُذف")

    author = post.author
    title = _post_title(post)
    image = media_url(post.image) if post.image else None
    comments = list(
        db.scalars(
            select(Comment)
            .where(Comment.post_id == post.id)
            .order_by(Comment.created_at.asc(), Comment.id.asc())
            .limit(MAX_COMMENTS)
        ).unique()
    )

    parts = [
        "<article>",
        f'<h1 dir="auto">{escape(title)}</h1>',
        f"<p>بقلم {_author_link(author)} (@{escape(author.username)}) · {_time(post.created_at)}</p>",
    ]
    if image:
        alt = escape(post.title or title, quote=True)
        parts.append(f'<p><img src="{escape(image, quote=True)}" alt="{alt}" style="max-width:100%;height:auto" /></p>')
    parts.append(_paragraphs(post.content_text))
    if post.link_url:
        link = escape(post.link_url, quote=True)
        parts.append(f'<p><a href="{link}" rel="noopener noreferrer nofollow ugc">{escape(post.link_url)}</a></p>')
    if post.tags:
        tags = " ".join(f'<a href="/tags/{quote(tag.slug)}">#{escape(tag.slug)}</a>' for tag in post.tags)
        parts.append(f"<p>{tags}</p>")
    parts.append("</article>")
    if comments:
        parts.append(f"<section><h2>النقاش · Discussion ({post.comments_count})</h2>")
        for comment in comments:
            parts.append(
                f"<article><p>{_author_link(comment.author)} · {_time(comment.created_at)}</p>"
                f"{_paragraphs(comment.content)}</article>"
            )
        parts.append("</section>")
    parts.append(_more_links())

    summary = excerpt(post.content_text, 155)
    return Page(
        title=title,
        description=summary or title,
        path=path,
        body="".join(parts),
        og_type="article",
        image=image,
        published_at=post.created_at.isoformat(),
        author_name=author.display_name,
        json_ld={
            "@context": "https://schema.org",
            "@type": "DiscussionForumPosting",
            "headline": post.title or excerpt(post.content_text, 80),
            "articleBody": excerpt(post.content_text, 500),
            "datePublished": post.created_at.isoformat(),
            "dateModified": (post.edited_at or post.updated_at).isoformat(),
            "author": {"@type": "Person", "name": author.display_name, "url": _absolute(f"/u/{author.username}")},
            "url": _absolute(path),
            "keywords": ", ".join(tag.name for tag in post.tags),
            "commentCount": post.comments_count,
            "interactionStatistic": {
                "@type": "InteractionCounter",
                "interactionType": "https://schema.org/LikeAction",
                "userInteractionCount": post.likes_count,
            },
        },
    )


def explore_page(db: Session) -> Page:
    posts = list(db.scalars(posts_repo.latest_stmt().limit(LIST_SIZE)).unique())
    tags = db.execute(tags_repo.stats_stmt().limit(MAX_TAGS)).all()
    parts = ["<h1>استكشاف · Explore</h1>"]
    if tags:
        links = " ".join(f'<a href="/tags/{quote(tag.slug)}">#{escape(tag.slug)}</a>' for tag in tags)
        parts.append(f"<section><h2>الوسوم الشائعة · Popular tags</h2><p>{links}</p></section>")
    parts.append(f"<section><h2>أحدث المنشورات · Latest posts</h2>{_post_list(posts)}</section>")
    parts.append(_more_links())
    return Page(
        title="استكشاف",
        description="اكتشف ما يكتبه المطوّرون العرب: المنشورات الرائجة، الوسوم الشائعة، ومطوّرون تستحق متابعتهم.",
        path="/explore",
        body="".join(parts),
    )


def profile_page(db: Session, username: str) -> Page | None:
    """None means "send the plain shell": the account asked not to be made easier to find."""
    path = f"/u/{quote(username)}"
    user = users_repo.get_by_username(db, username)
    if user is None or not user.is_active:
        return not_found(path, "هذا الحساب غير موجود")
    if not users_repo.get_settings(db, user).discoverable:
        return None

    path = f"/u/{quote(user.username)}"
    bio = user.profile.bio if user.profile else None
    posts = list(
        db.scalars(
            select(Post)
            .where(posts_repo.visible(), Post.author_id == user.id)
            .order_by(Post.created_at.desc(), Post.id.desc())
            .limit(LIST_SIZE)
        ).unique()
    )
    parts = [f'<h1 dir="auto">{escape(user.display_name)}</h1>', f'<p dir="ltr">@{escape(user.username)}</p>']
    if bio:
        parts.append(_paragraphs(bio))
    if posts:
        parts.append(f"<section><h2>المنشورات · Posts</h2>{_post_list(posts)}</section>")
    parts.append(_more_links())
    avatar = media_url(user.profile.avatar) if user.profile else None
    return Page(
        title=f"{user.display_name} (@{user.username})",
        description=excerpt(bio, 155) if bio else f"{user.display_name} على ArabDev: المنشورات والردود والاهتمامات.",
        path=path,
        body="".join(parts),
        og_type="profile",
        image=avatar,
        json_ld={
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            "mainEntity": {
                "@type": "Person",
                "name": user.display_name,
                "alternateName": user.username,
                "description": bio or "",
                "url": _absolute(path),
            },
        },
    )


def tag_page(db: Session, slug: str) -> Page:
    slug = slug.lower()
    path = f"/tags/{quote(slug)}"
    tag = tags_repo.get_by_slug(db, slug)
    if tag is None:
        return not_found(path, f"#{slug}")
    posts = list(db.scalars(posts_repo.tag_stmt(slug).limit(LIST_SIZE)).unique())
    body = f'<h1 dir="ltr">#{escape(slug)}</h1><section>{_post_list(posts)}</section>{_more_links()}'
    return Page(
        title=f"#{slug}",
        description=f"منشورات موسومة بـ #{slug} على ArabDev، بأقلام مطوّرين عرب.",
        path=path,
        body=body,
    )
