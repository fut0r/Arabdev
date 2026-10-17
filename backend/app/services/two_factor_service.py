"""Two-factor sign-in with an authenticator app (TOTP, RFC 6238), plus one-time recovery codes.

Setting it up takes two steps: `start_setup` creates a secret and shows it as a QR code, and
`enable` turns it on once the app has produced a correct code, so nobody locks themselves out
with a half-scanned code. From then on, signing in asks for a code from the app (or a recovery
code) instead of the emailed one.

Codes are six digits for a 30-second step. One step either side is accepted to allow for clocks
that drift, and a code is never accepted twice.
"""

import base64
import hashlib
import hmac
import io
import secrets
import struct
import time
from dataclasses import dataclass
from urllib.parse import quote, urlencode

import segno
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.errors import Conflict, UnprocessableEntity
from app.core.security import verify_password
from app.models import RecoveryCode, User
from app.utils.time import utcnow

ISSUER = "ArabDev"
STEP_SECONDS = 30
DIGITS = 6
ALLOWED_DRIFT = 1  # steps either side of now
RECOVERY_CODE_COUNT = 10
# No 0/o, 1/l/i: recovery codes get written down and typed back.
RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_PURPOSE = "totp"


@dataclass
class Setup:
    secret: str
    otpauth_uri: str
    qr_code: str  # an SVG data URI


# ---------------------------------------------------------------- TOTP


def _new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code_at(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{number % 10**DIGITS:0{DIGITS}d}"


def _current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // STEP_SECONDS)


def _matching_step(secret: str, code: str, now: float | None = None) -> int | None:
    digits = "".join(character for character in code if character.isdigit())
    if len(digits) != DIGITS:
        return None
    current = _current_step(now)
    for step in range(current - ALLOWED_DRIFT, current + ALLOWED_DRIFT + 1):
        if hmac.compare_digest(_code_at(secret, step), digits):
            return step
    return None


def _otpauth_uri(secret: str, username: str) -> str:
    label = quote(f"{ISSUER}:{username}")
    query = urlencode(
        {"secret": secret, "issuer": ISSUER, "algorithm": "SHA1", "digits": DIGITS, "period": STEP_SECONDS}
    )
    return f"otpauth://totp/{label}?{query}"


def _qr_code(uri: str) -> str:
    buffer = io.BytesIO()
    segno.make(uri, error="m").save(buffer, kind="svg", scale=5, border=2, dark="#111111", light="#ffffff")
    return "data:image/svg+xml;base64," + base64.b64encode(buffer.getvalue()).decode()


def _secret_of(user: User) -> str | None:
    return crypto.decrypt(user.totp_secret, _PURPOSE) if user.totp_secret else None


# ---------------------------------------------------------------- recovery codes


def _hash_recovery(code: str) -> str:
    normalized = "".join(character for character in code.lower() if character.isalnum())
    return hashlib.sha256(normalized.encode()).hexdigest()


def _new_recovery_codes(db: Session, user: User) -> list[str]:
    db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(10))
        code = f"{raw[:5]}-{raw[5:]}"
        db.add(RecoveryCode(user_id=user.id, code_hash=_hash_recovery(code)))
        codes.append(code)
    return codes


def recovery_codes_left(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(RecoveryCode)
            .where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None))
        )
        or 0
    )


def _use_recovery_code(db: Session, user: User, code: str) -> bool:
    used = db.execute(
        update(RecoveryCode)
        .where(
            RecoveryCode.user_id == user.id,
            RecoveryCode.code_hash == _hash_recovery(code),
            RecoveryCode.used_at.is_(None),
        )
        .values(used_at=utcnow())
    ).rowcount
    return bool(used)


# ---------------------------------------------------------------- the account's side


def is_enabled(user: User) -> bool:
    return user.totp_enabled_at is not None and user.totp_secret is not None


def _require_password(user: User, password: str) -> None:
    if not verify_password(password, user.hashed_password):
        raise UnprocessableEntity("Your password is incorrect", "current_password_invalid", field="password")


def start_setup(db: Session, user: User, password: str) -> Setup:
    _require_password(user, password)
    if is_enabled(user):
        raise Conflict("Two-factor sign-in is already on", "two_factor_already_enabled")
    secret = _new_secret()
    user.totp_secret = crypto.encrypt(secret, _PURPOSE)
    user.totp_enabled_at = None
    user.totp_last_step = None
    db.commit()
    uri = _otpauth_uri(secret, user.username)
    return Setup(secret=secret, otpauth_uri=uri, qr_code=_qr_code(uri))


def enable(db: Session, user: User, code: str) -> list[str]:
    """Turn it on with a first correct code. Returns the recovery codes, shown only this once."""
    if is_enabled(user):
        raise Conflict("Two-factor sign-in is already on", "two_factor_already_enabled")
    secret = _secret_of(user)
    if secret is None:
        raise UnprocessableEntity("Start the setup again", "two_factor_setup_missing")
    step = _matching_step(secret, code)
    if step is None:
        raise UnprocessableEntity(
            "That code is not right. Check the app and try again.", "two_factor_code_invalid", field="code"
        )
    user.totp_enabled_at = utcnow()
    user.totp_last_step = step
    codes = _new_recovery_codes(db, user)
    db.commit()
    return codes


def check_code(db: Session, user: User, code: str) -> str | None:
    """Which kind of code matched: "app", "recovery", or None. Commits what it uses up."""
    if not is_enabled(user):
        return None
    secret = _secret_of(user)
    if secret is not None:
        step = _matching_step(secret, code)
        if step is not None and (user.totp_last_step is None or step > user.totp_last_step):
            user.totp_last_step = step
            db.commit()
            return "app"
    if any(character.isalpha() for character in code) and _use_recovery_code(db, user, code):
        db.commit()
        return "recovery"
    return None


def disable(db: Session, user: User, password: str, code: str) -> None:
    _require_password(user, password)
    if not is_enabled(user):
        return
    if not check_code(db, user, code):
        raise UnprocessableEntity("That code is not right", "two_factor_code_invalid", field="code")
    user.totp_secret = None
    user.totp_enabled_at = None
    user.totp_last_step = None
    db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    db.commit()


def regenerate_recovery_codes(db: Session, user: User, password: str) -> list[str]:
    _require_password(user, password)
    if not is_enabled(user):
        raise Conflict("Turn on two-factor sign-in first", "two_factor_not_enabled")
    codes = _new_recovery_codes(db, user)
    db.commit()
    return codes
