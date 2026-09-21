"""Cloudflare Turnstile: proof that a real browser, not a script, sent the request.

The widget hands the browser a token; this checks that token with Cloudflare before the
request is allowed through. Tokens are single-use and expire after five minutes, so each
protected action needs its own. The secret key never leaves the server.

Both keys must be configured for the checks to run; without them every call is allowed,
which keeps local development and the test suite working.
"""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Header, Request

from app.core.config import settings
from app.core.errors import ServiceUnavailable, UnprocessableEntity
from app.core.rate_limit import client_ip

logger = logging.getLogger("arabdev.turnstile")

TOKEN_HEADER = "X-Turnstile-Token"
MAX_TOKEN_LENGTH = 2048

# Cloudflare's own wording, mapped to what the visitor should do about it.
_RETRYABLE = {"timeout-or-duplicate", "invalid-input-response", "missing-input-response"}


class TurnstileUnavailable(ServiceUnavailable):
    code = "turnstile_unavailable"


def _post(token: str, remote_ip: str | None, idempotency_key: str) -> dict:
    form = {"secret": settings.turnstile_secret_key or "", "response": token, "idempotency_key": idempotency_key}
    if remote_ip:
        form["remoteip"] = remote_ip
    request = urllib.request.Request(
        settings.turnstile_verify_url,
        data=urllib.parse.urlencode(form).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ArabDev/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=settings.turnstile_timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def siteverify(token: str, *, remote_ip: str | None = None) -> dict:
    """Ask Cloudflare about a token, retrying once on a network error.

    The same idempotency key is used for both attempts, so a retry after a timeout is not
    mistaken for someone replaying the token.
    """
    idempotency_key = str(uuid.uuid4())
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            return _post(token, remote_ip, idempotency_key)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            last_error = exc
            logger.warning("Turnstile verification attempt %d failed: %s", attempt + 1, exc)
    raise TurnstileUnavailable(
        "We could not run the security check just now. Please try again.",
        "turnstile_unavailable",
    ) from last_error


def verify(token: str | None, *, action: str, remote_ip: str | None = None) -> None:
    """Raise unless the token is a fresh, unused token for this action."""
    if not settings.turnstile_configured:
        return
    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise UnprocessableEntity(
            "Please complete the security check and try again.", "turnstile_missing", field="turnstile_token"
        )

    result = siteverify(token, remote_ip=remote_ip)
    if result.get("success"):
        hostname = result.get("hostname")
        allowed = settings.turnstile_hostnames
        if allowed and hostname and hostname not in allowed:
            logger.warning("Turnstile token solved on unexpected hostname %r (action=%s)", hostname, action)
            raise UnprocessableEntity(
                "Please complete the security check and try again.", "turnstile_failed", field="turnstile_token"
            )
        served_action = result.get("action")
        if served_action and served_action != action:
            logger.warning("Turnstile token for action %r used on %r", served_action, action)
            raise UnprocessableEntity(
                "Please complete the security check and try again.", "turnstile_failed", field="turnstile_token"
            )
        return

    codes = [str(code) for code in result.get("error-codes") or []]
    logger.warning("Turnstile rejected a token (action=%s, codes=%s)", action, codes)
    if any(code in _RETRYABLE for code in codes):
        raise UnprocessableEntity(
            "That security check expired. Please try again.", "turnstile_expired", field="turnstile_token"
        )
    if any(code.endswith("input-secret") for code in codes):
        # Our configuration is wrong, not the visitor's fault; don't blame them for it.
        raise TurnstileUnavailable(
            "We could not run the security check just now. Please try again.", "turnstile_unavailable"
        )
    raise UnprocessableEntity(
        "Please complete the security check and try again.", "turnstile_failed", field="turnstile_token"
    )


def guard(action: str) -> Callable[..., None]:
    """Route dependency: `dependencies=[Depends(turnstile_service.guard("login"))]`.

    The browser sends the widget's token in the X-Turnstile-Token header, which keeps
    request bodies (including multipart uploads) unchanged.
    """

    def dependency(
        request: Request,
        x_turnstile_token: Annotated[str | None, Header(description="Cloudflare Turnstile token")] = None,
    ) -> None:
        verify(x_turnstile_token, action=action, remote_ip=client_ip(request))

    return dependency
