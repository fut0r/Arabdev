from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False, description="Access token from /auth/login")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user_optional(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User | None:
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise Unauthorized("Your session has expired", "token_invalid")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise Unauthorized("Your session has expired", "token_invalid") from None
    user = db.get(User, user_id)
    if user is None or not user.is_active or payload.get("ver") != user.token_version:
        raise Unauthorized("Your session has expired", "token_invalid")
    return user


def get_session_family(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str | None:
    """Which sign-in session this request belongs to, from the access token."""
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    family = payload.get("fam") if payload else None
    return family if isinstance(family, str) else None


def get_current_user(user: Annotated[User | None, Depends(get_current_user_optional)]) -> User:
    if user is None:
        raise Unauthorized("Sign in to continue", "not_authenticated")
    return user


def get_admin_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise Forbidden("Administrator access required", "admin_required")
    return user


def require_client_header(x_arabdev_client: Annotated[str | None, Header()] = None) -> None:
    """CSRF guard for cookie-authenticated endpoints: browsers cannot add custom headers
    to cross-site form posts, and cross-site fetches with them fail CORS preflight."""
    if not x_arabdev_client:
        raise Forbidden("Missing client header", "client_header_required")


CurrentUser = Annotated[User, Depends(get_current_user)]
SessionFamily = Annotated[str | None, Depends(get_session_family)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]
AdminUser = Annotated[User, Depends(get_admin_user)]
