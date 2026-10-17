"""Reusable input rules. Errors carry a stable code the frontend translates."""

import re
from urllib.parse import urlparse

from pydantic_core import PydanticCustomError

USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{2,19}$")

RESERVED_USERNAMES = frozenset(
    {
        "about",
        "admin",
        "administrator",
        "api",
        "arabdev",
        "auth",
        "bookmarks",
        "create",
        "drafts",
        "explore",
        "help",
        "home",
        "login",
        "logout",
        "me",
        "media",
        "moderator",
        "notifications",
        "null",
        "official",
        "onboarding",
        "posts",
        "privacy",
        "profile",
        "register",
        "root",
        "search",
        "settings",
        "signin",
        "signup",
        "static",
        "support",
        "system",
        "tags",
        "terms",
        "undefined",
    }
)

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def normalize_username(value: str) -> str:
    value = (value or "").strip().lstrip("@").lower()
    if not USERNAME_RE.fullmatch(value):
        raise PydanticCustomError(
            "username_invalid",
            "Usernames are 3-20 characters: English letters, numbers and underscores, starting with a letter",
        )
    if value in RESERVED_USERNAMES:
        raise PydanticCustomError("username_reserved", "This username is reserved")
    return value


def validate_password_strength(value: str) -> str:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise PydanticCustomError("password_too_short", "Password must be at least 8 characters")
    if len(value) > PASSWORD_MAX_LENGTH:
        raise PydanticCustomError("password_too_long", "Password must be at most 128 characters")
    has_letter = any(ch.isalpha() for ch in value)
    has_digit = any(ch.isdigit() for ch in value)
    if not (has_letter and has_digit) or len(set(value)) < 4:
        raise PydanticCustomError("password_too_weak", "Use a mix of letters and numbers that is hard to guess")
    return value


def normalize_http_url(value: str | None, *, max_length: int = 500, add_scheme: bool = False) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if add_scheme and "://" not in value:
        value = "https://" + value
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or " " in value:
        raise PydanticCustomError("url_invalid", "Enter a valid link starting with http:// or https://")
    if len(value) > max_length:
        raise PydanticCustomError("url_too_long", "This link is too long")
    return value


def clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None
