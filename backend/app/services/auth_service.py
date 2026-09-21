import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from pydantic_core import PydanticCustomError
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import Conflict, NotFound, TooManyRequests, Unauthorized, UnprocessableEntity
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.models import PasswordResetToken, RefreshToken, User
from app.repositories import users as users_repo
from app.schemas.auth import AvailabilityOut, FieldAvailability, RegisterIn
from app.services import email_service, verification_service
from app.services.verification_service import Challenge
from app.utils.time import utcnow
from app.utils.validators import normalize_username

# One email address may fail sign-in this many times per window before it is asked to
# wait, however many networks the attempts come from.
LOGIN_FAILURE_LIMIT = 8
LOGIN_FAILURE_WINDOW = 900

logger = logging.getLogger("arabdev.auth")


@dataclass
class SessionInfo:
    """One signed-in browser, as shown under Settings."""

    id: int
    user_agent: str | None
    created_at: datetime
    expires_at: datetime
    remember: bool
    current: bool


@dataclass
class IssuedTokens:
    access_token: str
    expires_in: int
    refresh_token: str
    remember: bool
    user: User


def _check_new_account(db: Session, username: str, email: str) -> None:
    if users_repo.username_taken(db, username):
        raise Conflict("Username is already taken", "username_taken", field="username")
    if users_repo.email_taken(db, email):
        raise Conflict("An account with this email already exists", "email_taken", field="email")


def register(db: Session, data: RegisterIn, language: str = "ar", *, email_verified: bool = False) -> User:
    _check_new_account(db, data.username, data.email)
    user = users_repo.create_user(
        db,
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
        language=language,
    )
    if email_verified:
        user.email_verified_at = utcnow()
    db.commit()
    return user


def start_registration(db: Session, data: RegisterIn, language: str = "ar", ip: str | None = None) -> Challenge:
    """Hold the account until the address is confirmed: nothing is created yet."""
    _check_new_account(db, data.username, data.email)
    return verification_service.start(
        db,
        purpose="register",
        email=data.email,
        language=language,
        # The password is hashed here and never stored in the clear, not even briefly.
        payload={
            "username": data.username,
            "hashed_password": hash_password(data.password),
            "language": language,
        },
        ip=ip,
    )


def complete_registration(db: Session, challenge_id: str, code: str) -> User:
    record = verification_service.consume(db, challenge_id, code, purpose="register")
    payload = verification_service.read_payload(record)
    username, hashed_password = payload.get("username"), payload.get("hashed_password")
    if not username or not hashed_password:  # pragma: no cover - only if the row was edited by hand
        raise UnprocessableEntity("This confirmation is no longer valid. Please start again.", "code_challenge_invalid")
    # Somebody may have taken the name or the address while the code sat in an inbox.
    _check_new_account(db, username, record.email)
    user = users_repo.create_user(
        db,
        username=username,
        email=record.email,
        hashed_password=hashed_password,
        language=payload.get("language", "ar"),
    )
    user.email_verified_at = utcnow()
    db.commit()
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """Check an email and password. Starting the session is a separate step."""
    allowed, retry_after = rate_limit.consume("login_email", email, LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW)
    if not allowed:
        raise TooManyRequests(
            "Too many sign-in attempts for this account. Please wait a few minutes.",
            headers={"Retry-After": str(max(retry_after, 1))},
        )
    user = users_repo.get_by_email(db, email)
    if user is None:
        # Hash anyway so response time does not reveal whether the email exists.
        hash_password(password)
        raise Unauthorized("Email or password is incorrect", "invalid_credentials")
    if not verify_password(password, user.hashed_password):
        raise Unauthorized("Email or password is incorrect", "invalid_credentials")
    if not user.is_active:
        raise Unauthorized("This account has been deactivated", "account_inactive")
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(password)
        db.commit()
    return user


def login_needs_code(db: Session, user: User) -> bool:
    """Whether this sign-in has to be confirmed by email."""
    if not settings.email_codes_required:
        return False
    return users_repo.get_settings(db, user).login_code_required


def start_login(db: Session, user: User, *, remember: bool, ip: str | None = None) -> Challenge:
    language = users_repo.get_settings(db, user).language
    return verification_service.start(
        db,
        purpose="login",
        email=user.email,
        language=language,
        user_id=user.id,
        payload={"remember": remember},
        ip=ip,
    )


def complete_login(db: Session, challenge_id: str, code: str) -> tuple[User, bool]:
    record = verification_service.consume(db, challenge_id, code, purpose="login")
    user = users_repo.get_by_id(db, record.user_id) if record.user_id else None
    if user is None or not user.is_active:
        raise Unauthorized("This account is no longer available", "account_inactive")
    return user, bool(verification_service.read_payload(record).get("remember"))


def _refresh_lifetime(remember: bool) -> timedelta:
    if remember:
        return timedelta(days=settings.refresh_token_expire_days)
    return timedelta(hours=settings.refresh_token_session_hours)


def issue_tokens(
    db: Session, user: User, *, remember: bool, family_id: str | None = None, user_agent: str | None = None
) -> IssuedTokens:
    family = family_id or str(uuid.uuid4())
    access_token, expires_in = create_access_token(user.id, user.token_version, family)
    refresh_token = generate_opaque_token()
    user.last_login_at = utcnow()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            family_id=family,
            remember=remember,
            user_agent=(user_agent or "")[:255] or None,
            expires_at=utcnow() + _refresh_lifetime(remember),
        )
    )
    db.commit()
    return IssuedTokens(access_token, expires_in, refresh_token, remember, user)


def rotate_refresh_token(db: Session, raw_token: str | None, user_agent: str | None = None) -> IssuedTokens:
    if not raw_token:
        raise Unauthorized("Your session has expired. Please sign in again.", "session_expired")
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if stored is None:
        raise Unauthorized("Your session has expired. Please sign in again.", "session_expired")

    now = utcnow()
    grace = timedelta(seconds=settings.refresh_reuse_grace_seconds)
    if stored.revoked_at is not None and stored.rotated_at is not None and now - stored.rotated_at <= grace:
        # Another tab refreshed with the same cookie a moment ago: a race, not theft.
        user = users_repo.get_by_id(db, stored.user_id)
        if user is not None and user.is_active:
            return issue_tokens(db, user, remember=stored.remember, family_id=stored.family_id, user_agent=user_agent)
    if stored.revoked_at is not None:
        # A rotated token was presented again: assume theft and end every session in this family.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == stored.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise Unauthorized("Your session has expired. Please sign in again.", "session_expired")
    if stored.expires_at <= now:
        raise Unauthorized("Your session has expired. Please sign in again.", "session_expired")

    user = users_repo.get_by_id(db, stored.user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Your session has expired. Please sign in again.", "session_expired")

    stored.revoked_at = now
    stored.rotated_at = now
    return issue_tokens(db, user, remember=stored.remember, family_id=stored.family_id, user_agent=user_agent)


def revoke_refresh_token(db: Session, raw_token: str | None) -> None:
    if not raw_token:
        return
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(raw_token), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


def revoke_all_sessions(db: Session, user: User) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    user.token_version += 1


def check_availability(
    db: Session, username: str | None, email: str | None, exclude_id: int | None = None
) -> AvailabilityOut:
    result = AvailabilityOut()
    if username is not None:
        try:
            normalized = normalize_username(username)
        except PydanticCustomError as exc:
            result.username = FieldAvailability(available=False, code=exc.type, detail=exc.message())
        else:
            taken = users_repo.username_taken(db, normalized, exclude_id)
            result.username = FieldAvailability(
                available=not taken,
                code="username_taken" if taken else None,
                detail="Username is already taken" if taken else None,
            )
    if email is not None:
        taken = users_repo.email_taken(db, email.strip().lower(), exclude_id)
        result.email = FieldAvailability(
            available=not taken,
            code="email_taken" if taken else None,
            detail="An account with this email already exists" if taken else None,
        )
    return result


def request_password_reset(db: Session, email: str) -> None:
    user = users_repo.get_by_email(db, email)
    if user is None or not user.is_active:
        return  # Same response either way: never reveal which emails have accounts.
    token = generate_opaque_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=utcnow() + timedelta(minutes=settings.password_reset_expire_minutes),
        )
    )
    db.commit()
    email_service.send_password_reset(user.email, token, users_repo.get_settings(db, user).language)


def reset_password(db: Session, raw_token: str, new_password: str) -> None:
    stored = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw_token)))
    now = utcnow()
    if stored is None or stored.used_at is not None or stored.expires_at <= now:
        raise UnprocessableEntity(
            "This reset link is invalid or has expired. Request a new one.", "reset_token_invalid", field="token"
        )
    user = users_repo.get_by_id(db, stored.user_id)
    if user is None:
        raise UnprocessableEntity("This reset link is invalid or has expired.", "reset_token_invalid", field="token")
    user.hashed_password = hash_password(new_password)
    user.password_changed_at = now
    stored.used_at = now
    revoke_all_sessions(db, user)
    db.commit()
    notify_security(db, user, "password_changed")


def _check_password_change(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise UnprocessableEntity("Current password is incorrect", "current_password_invalid", field="current_password")
    if verify_password(new_password, user.hashed_password):
        raise UnprocessableEntity(
            "Choose a password different from your current one", "password_unchanged", field="new_password"
        )


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    _check_password_change(db, user, current_password, new_password)
    _apply_new_password(db, user, hash_password(new_password))


def _apply_new_password(db: Session, user: User, hashed_password: str) -> None:
    user.hashed_password = hashed_password
    user.password_changed_at = utcnow()
    revoke_all_sessions(db, user)
    db.commit()
    notify_security(db, user, "password_changed")


def start_password_change(
    db: Session, user: User, current_password: str, new_password: str, ip: str | None = None
) -> Challenge:
    """Ask for a code before a new password takes effect, so a borrowed screen is not
    enough to take an account over."""
    _check_password_change(db, user, current_password, new_password)
    return verification_service.start(
        db,
        purpose="password_change",
        email=user.email,
        language=users_repo.get_settings(db, user).language,
        user_id=user.id,
        payload={"hashed_password": hash_password(new_password)},
        ip=ip,
    )


def complete_password_change(db: Session, user: User, challenge_id: str, code: str) -> None:
    record = verification_service.consume(db, challenge_id, code, purpose="password_change")
    if record.user_id != user.id:
        raise UnprocessableEntity("This confirmation is no longer valid. Please start again.", "code_challenge_invalid")
    hashed_password = verification_service.read_payload(record).get("hashed_password")
    if not hashed_password:  # pragma: no cover - only if the row was edited by hand
        raise UnprocessableEntity("This confirmation is no longer valid. Please start again.", "code_challenge_invalid")
    _apply_new_password(db, user, hashed_password)


def notify_security(db: Session, user: User, kind: str, detail: str | None = None) -> None:
    """Tell someone their account changed, unless they asked us not to.

    Delivery problems are never allowed to undo a change that already happened.
    """
    account_settings = users_repo.get_settings(db, user)
    if kind != "email_changed" and not account_settings.email_security_alerts:
        return
    try:
        email_service.send_security_alert(user.email, kind, account_settings.language, detail)
    except Exception:  # pragma: no cover - mail is best effort here
        logger.warning("Could not send the %s alert to user %s", kind, user.id, exc_info=True)


# ------------------------------------------------------------ signed-in devices


def list_sessions(db: Session, user: User, family_id: str | None) -> list[SessionInfo]:
    """Every browser currently holding a valid refresh token for this account."""
    now = utcnow()
    rows = db.scalars(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .order_by(RefreshToken.created_at.desc())
    )
    return [
        SessionInfo(
            id=row.id,
            user_agent=row.user_agent,
            created_at=row.created_at,
            expires_at=row.expires_at,
            remember=row.remember,
            current=family_id is not None and row.family_id == family_id,
        )
        for row in rows
    ]


def revoke_session(db: Session, user: User, session_id: int) -> None:
    """End one signed-in browser. The whole family goes, so its next refresh fails."""
    stored = db.scalar(
        select(RefreshToken).where(RefreshToken.id == session_id, RefreshToken.user_id == user.id)
    )
    if stored is None:
        raise NotFound("That session no longer exists", "session_not_found")
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == stored.family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


def revoke_other_sessions(db: Session, user: User, family_id: str | None) -> int:
    """Sign out everywhere except here."""
    stmt = update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    if family_id:
        stmt = stmt.where(RefreshToken.family_id != family_id)
    ended = db.execute(stmt.values(revoked_at=utcnow())).rowcount
    db.commit()
    return ended


# How long ended sign-in records are kept before deletion. Revoked and rotated tokens are
# kept for a week so reuse of a stolen token is still recognised; after that they only
# describe old sessions and have no further use.
ENDED_SESSION_RETENTION = timedelta(days=7)
USED_RESET_RETENTION = timedelta(days=1)


def purge_expired_tokens(db: Session) -> tuple[int, int]:
    """Delete refresh and password-reset records that can no longer be used."""
    now = utcnow()
    session_cutoff = now - ENDED_SESSION_RETENTION
    sessions = db.execute(
        delete(RefreshToken).where(
            or_(RefreshToken.expires_at < session_cutoff, RefreshToken.revoked_at < session_cutoff)
        )
    ).rowcount
    reset_cutoff = now - USED_RESET_RETENTION
    resets = db.execute(
        delete(PasswordResetToken).where(
            or_(PasswordResetToken.expires_at < reset_cutoff, PasswordResetToken.used_at < reset_cutoff)
        )
    ).rowcount
    db.commit()
    resets += verification_service.purge_expired(db)
    return sessions, resets
