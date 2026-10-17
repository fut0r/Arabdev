"""Refuses new passwords that are already public in data breaches.

Uses Have I Been Pwned's Pwned Passwords range API, which never sees the password. Only the
first five characters of its SHA-1 hash are sent; the service answers with every known hash
that starts with them (several hundred), and the comparison happens here. Responses are padded
so their size does not hint at the answer.

The check is a safeguard, not a gate: if the service is slow or unreachable, the password is
accepted rather than locking people out of signing up or changing it.
"""

import hashlib
import logging
import urllib.request

from app.core.config import settings
from app.core.errors import UnprocessableEntity

logger = logging.getLogger("arabdev.passwords")

RANGE_URL = "https://api.pwnedpasswords.com/range/"
TIMEOUT_SECONDS = 3


def breach_count(password: str) -> int | None:
    """How many times the password appears in known breaches, or None if the service did not answer."""
    digest = hashlib.sha1(password.encode("utf-8"), usedforsecurity=False).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    request = urllib.request.Request(  # noqa: S310 - a fixed https address
        RANGE_URL + prefix, headers={"Add-Padding": "true", "User-Agent": "ArabDev-password-check"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            body = response.read().decode("ascii", "replace")
    except Exception:
        logger.warning("Pwned Passwords did not answer; accepting the password", exc_info=True)
        return None
    for line in body.splitlines():
        candidate, _, count = line.partition(":")
        if candidate.strip() == suffix:
            return int(count.strip() or 0)
    return 0


def ensure_not_breached(password: str, field: str = "password") -> None:
    if not settings.pwned_passwords_enabled:
        return
    if breach_count(password):
        raise UnprocessableEntity(
            "This password has appeared in a data breach, so attackers already try it. Choose another one.",
            "password_breached",
            field=field,
        )
