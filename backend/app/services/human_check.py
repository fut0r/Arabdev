"""A real browser behind every action that writes, not only behind the big forms.

Signing in, signing up, publishing and commenting each ask Turnstile for a fresh token. The
rest of what a signed-in account can do (like, save, repost, follow, block, report, upload,
edit a profile, save a draft) would otherwise be open to a script holding a session. So the
browser solves an invisible Turnstile check, trades it at POST /users/me/human-check for a
"human pass" that lasts 30 minutes, and sends the pass with those requests in the X-ArabDev-Human
header. When it runs out, the app solves another one in the background and repeats the request.

The pass is a signed token for one account and one sign-in generation: it is useless for any
other account, and signing out everywhere or changing the password voids it. It can never be
used as an access token. Without Turnstile keys (development, tests) the check is skipped.
"""

from datetime import timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Header

from app.core.config import settings
from app.core.deps import CurrentUser
from app.core.errors import Forbidden
from app.models import User
from app.utils.time import utcnow

HEADER = "X-ArabDev-Human"
LIFETIME = timedelta(minutes=30)
_TYPE = "human"


def issue(user: User) -> tuple[str, int]:
    """A signed pass for this account and its expiry in seconds."""
    now = utcnow()
    payload = {"type": _TYPE, "sub": str(user.id), "ver": user.token_version, "iat": now, "exp": now + LIFETIME}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm), int(LIFETIME.total_seconds())


def is_valid(token: str, user: User) -> bool:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return False
    return (
        payload.get("type") == _TYPE and payload.get("sub") == str(user.id) and payload.get("ver") == user.token_version
    )


def _require_human(
    user: CurrentUser,
    x_arabdev_human: Annotated[str | None, Header(description="Human pass from POST /users/me/human-check")] = None,
) -> None:
    if not settings.turnstile_configured:
        return
    if not x_arabdev_human or len(x_arabdev_human) > 1024 or not is_valid(x_arabdev_human, user):
        raise Forbidden("Please confirm you're not a robot, then try again.", "human_check_required")


# dependencies=[RequireHuman] on a route; FastAPI resolves the signed-in user only once.
RequireHuman = Depends(_require_human)
