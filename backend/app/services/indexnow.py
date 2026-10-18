"""Tells search engines other than Google about new, edited and deleted pages, with IndexNow.

Google finds pages through the sitemap and Search Console. Bing, Yandex, Seznam, Naver and Yep
accept IndexNow instead: one request to api.indexnow.org reaches all of them, and Bing's index
also feeds DuckDuckGo, Yahoo and Ecosia. Without it they only find what they happen to crawl.

The protocol asks the site to publish a key at /<key>.txt, which proves the submitter controls
the site. The key is derived from SECRET_KEY, so every deployment has its own without another
setting, and it reveals nothing about the secret. Only public page addresses are sent.

Submitting is a courtesy, never a requirement: a failure is logged and nothing else happens.
"""

import hashlib
import hmac
import json
import logging
import re
import urllib.error
import urllib.request
from collections.abc import Iterable
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import User
from app.repositories import users as users_repo

logger = logging.getLogger("arabdev.indexnow")

ENDPOINT = "https://api.indexnow.org/indexnow"
TIMEOUT_SECONDS = 3
# The protocol accepts up to 10,000 addresses per request.
MAX_URLS = 10_000
KEY_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def key() -> str:
    return hmac.new(settings.secret_key.encode(), b"arabdev:indexnow:v1", hashlib.sha256).hexdigest()[:32]


def is_key(name: str) -> bool:
    return bool(KEY_PATTERN.match(name)) and hmac.compare_digest(name, key())


def post_paths(post_id: int, author: User, db: Session, tag_slugs: Iterable[str] = ()) -> list[str]:
    """The pages that change when a post does: the post, its author's profile, its tags, the homepage.

    The profile is left out for accounts that turned off "Show me in search and suggestions",
    exactly as the sitemap leaves it out.
    """
    paths = [f"/posts/{post_id}"]
    if users_repo.get_settings(db, author).discoverable:
        paths.append(f"/u/{author.username}")
    return [*paths, *(f"/tags/{slug}" for slug in tag_slugs), "/"]


def submit(paths: list[str]) -> bool:
    """Send these site paths to IndexNow. Returns whether the engines accepted them."""
    if not settings.indexnow_active or not paths:
        return False
    base = settings.frontend_url.rstrip("/")
    unique = list(dict.fromkeys(base + path for path in paths))[:MAX_URLS]
    body = json.dumps(
        {
            "host": urlsplit(base).hostname,
            "key": key(),
            "keyLocation": f"{base}/{key()}.txt",
            "urlList": unique,
        }
    ).encode()
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "ArabDev-indexnow"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 - a fixed https address
            accepted = response.status in (200, 202)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        logger.warning("IndexNow did not take %d addresses: %s", len(unique), error)
        return False
    if not accepted:
        logger.warning("IndexNow answered %s for %d addresses", response.status, len(unique))
    return accepted
