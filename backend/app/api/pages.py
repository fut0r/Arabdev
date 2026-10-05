"""HTML for the public pages, served from the root of the site (see services/page_service.py).

In production the host sends /posts/<id>, /u/<name>, /tags/<slug> and /explore here (vercel.json
and frontend/nginx.conf); every other address still gets the static app shell. Each response is
the same shell with that page's title, description and text written into it.
"""

import logging
from collections.abc import Callable

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from app.core.deps import DbSession
from app.core.rate_limit import rate_limit
from app.services import page_service
from app.services.page_service import Page

logger = logging.getLogger("arabdev.pages")

router = APIRouter(
    include_in_schema=False,
    dependencies=[Depends(rate_limit("page", limit=240, window=60))],
)

# The edge keeps a page for a minute and may hand out that copy for ten more while it fetches a
# fresh one, so an edited or removed post is corrected everywhere within minutes. Browsers always
# revalidate: a kept copy of the shell would point at the previous build's files.
CACHE_FOUND = "public, max-age=0, s-maxage=60, stale-while-revalidate=600"
CACHE_MISSING = "public, max-age=0, s-maxage=60"


def _respond(build: Callable[[], Page | None]) -> HTMLResponse:
    shell, source = page_service.load_shell()
    try:
        page = build()
        html = page_service.render(page, shell) if page is not None else shell
        status = page.status if page is not None else 200
        cache = CACHE_FOUND if status == 200 else CACHE_MISSING
    except Exception:
        # The app can still load and show its own error; never turn a page into a server error.
        logger.exception("Could not write the page into the shell")
        html, status, cache = shell, 200, "no-store"
    return HTMLResponse(
        html,
        status_code=status,
        headers={
            "Cache-Control": cache,
            # Matches the static pages, which the host serves with this value.
            "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
            "X-ArabDev-Shell": source,
        },
    )


@router.api_route("/posts/{post_id}", methods=["GET", "HEAD"])
def post(post_id: int, db: DbSession) -> HTMLResponse:
    return _respond(lambda: page_service.post_page(db, post_id))


@router.api_route("/explore", methods=["GET", "HEAD"])
def explore(db: DbSession) -> HTMLResponse:
    return _respond(lambda: page_service.explore_page(db))


@router.api_route("/u/{username}", methods=["GET", "HEAD"])
def profile(username: str, db: DbSession) -> HTMLResponse:
    return _respond(lambda: page_service.profile_page(db, username))


@router.api_route("/tags/{slug}", methods=["GET", "HEAD"])
def tag(slug: str, db: DbSession) -> HTMLResponse:
    return _respond(lambda: page_service.tag_page(db, slug))
