"""Who may moderate, and who is currently barred from publishing."""

from app.core.config import settings
from app.core.errors import Forbidden
from app.models import User
from app.utils.time import utcnow


def is_admin(user: User | None) -> bool:
    """Marked admin in the database, or named in ADMIN_USERNAMES."""
    if user is None:
        return False
    if user.is_admin:
        return True
    return user.username.lower() in {name.strip().lower() for name in settings.admin_usernames}


def is_restricted(user: User) -> bool:
    return user.restricted_until is not None and user.restricted_until > utcnow()


def ensure_can_publish(user: User) -> None:
    """Posting, commenting, reposting and editing stop while a restriction is in force."""
    if is_restricted(user):
        until = user.restricted_until.strftime("%d %B %Y") if user.restricted_until else ""
        raise Forbidden(
            f"Your account can't publish until {until}.",
            "account_restricted",
        )
