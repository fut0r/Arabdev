"""Six-digit codes, emailed to prove that whoever is asking can read the inbox.

A code is created together with an opaque challenge id; the browser only ever sees the
id. The code itself is stored as an HMAC, tried at most a handful of times, expires in
minutes and is destroyed once used.
"""

import hmac
import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta
from hashlib import sha256

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import TooManyRequests, UnprocessableEntity
from app.models import VerificationCode
from app.services import email_service
from app.utils.time import utcnow

CODE_LENGTH = 6
# Codes are never resent forever: after this many, the visitor starts the flow again.
MAX_RESENDS = 4
# How long a used or expired row is kept, so a replayed code still says "expired"
# rather than "unknown", and so the audit trail survives a support question.
RETENTION = timedelta(days=1)


@dataclass
class Challenge:
    """What the browser gets back: never the code, never the full address."""

    challenge_id: str
    email: str
    expires_in: int
    resend_in: int
    purpose: str


def _generate_code() -> str:
    return f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"


def _hash_code(challenge_id: str, code: str) -> str:
    """Bound to the challenge id, so a hash from one attempt is useless for another."""
    return hmac.new(settings.secret_key.encode(), f"{challenge_id}:{code}".encode(), sha256).hexdigest()


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    if len(local) <= 2:
        hidden = local[0] + "*" if local else "*"
    else:
        hidden = f"{local[0]}{'*' * min(len(local) - 2, 6)}{local[-1]}"
    return f"{hidden}@{domain}"


def _challenge(record: VerificationCode) -> Challenge:
    now = utcnow()
    return Challenge(
        challenge_id=record.challenge_id,
        email=mask_email(record.email),
        expires_in=max(int((record.expires_at - now).total_seconds()), 0),
        resend_in=max(int((record.sent_at - now).total_seconds()) + settings.verification_resend_seconds, 0),
        purpose=record.purpose,
    )


def start(
    db: Session,
    *,
    purpose: str,
    email: str,
    language: str = "ar",
    user_id: int | None = None,
    payload: dict | None = None,
    ip: str | None = None,
) -> Challenge:
    """Create a code, email it, and return the challenge for the browser to answer.

    Any earlier unused challenge for the same purpose and address is dropped, so only the
    newest code in someone's inbox works.
    """
    now = utcnow()
    db.execute(
        update(VerificationCode)
        .where(
            VerificationCode.purpose == purpose,
            VerificationCode.email == email,
            VerificationCode.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    challenge_id = str(uuid.uuid4())
    code = _generate_code()
    record = VerificationCode(
        challenge_id=challenge_id,
        purpose=purpose,
        email=email,
        user_id=user_id,
        code_hash=_hash_code(challenge_id, code),
        payload=json.dumps(payload) if payload else None,
        language=language,
        ip=(ip or "")[:45] or None,
        sent_at=now,
        expires_at=now + timedelta(minutes=settings.verification_code_ttl_minutes),
    )
    db.add(record)
    db.commit()
    # Sending raises if the message cannot go out, so nobody waits for a code that is
    # never coming. The row stays behind, unused and harmless, and expires on its own.
    email_service.send_verification_code(email, code, purpose, language)
    return _challenge(record)


def _load(db: Session, challenge_id: str) -> VerificationCode:
    record = db.scalar(select(VerificationCode).where(VerificationCode.challenge_id == challenge_id))
    if record is None:
        raise UnprocessableEntity(
            "This confirmation is no longer valid. Please start again.", "code_challenge_invalid", field="code"
        )
    return record


def purpose_of(db: Session, challenge_id: str) -> str:
    """What a challenge is for, so one endpoint can finish either kind of sign-in."""
    return _load(db, challenge_id).purpose


def resend(db: Session, challenge_id: str, ip: str | None = None) -> Challenge:
    record = _load(db, challenge_id)
    now = utcnow()
    if record.consumed_at is not None or record.expires_at <= now:
        raise UnprocessableEntity(
            "This confirmation has expired. Please start again.", "code_expired", field="code"
        )
    wait = settings.verification_resend_seconds - int((now - record.sent_at).total_seconds())
    if wait > 0:
        raise TooManyRequests(
            "Please wait a moment before asking for another code.",
            "code_resend_too_soon",
            headers={"Retry-After": str(wait)},
        )
    if record.resends >= MAX_RESENDS:
        raise TooManyRequests("Too many codes were sent. Please start again.", "code_resend_limit")

    code = _generate_code()
    record.code_hash = _hash_code(record.challenge_id, code)
    record.resends += 1
    record.attempts = 0
    record.sent_at = now
    record.expires_at = now + timedelta(minutes=settings.verification_code_ttl_minutes)
    record.ip = (ip or record.ip or "")[:45] or None
    db.commit()
    email_service.send_verification_code(record.email, code, record.purpose, record.language)
    return _challenge(record)


def consume(db: Session, challenge_id: str, code: str, *, purpose: str) -> VerificationCode:
    """Check a code and burn it. Returns the record, with `payload` still readable."""
    record = _load(db, challenge_id)
    now = utcnow()
    if record.purpose != purpose:
        raise UnprocessableEntity(
            "This confirmation is no longer valid. Please start again.", "code_challenge_invalid", field="code"
        )
    if record.consumed_at is not None:
        raise UnprocessableEntity(
            "This code was already used. Please start again.", "code_used", field="code"
        )
    if record.expires_at <= now:
        raise UnprocessableEntity("This code has expired. Ask for a new one.", "code_expired", field="code")
    if record.attempts >= settings.verification_max_attempts:
        record.consumed_at = now
        db.commit()
        raise UnprocessableEntity(
            "Too many wrong codes. Please start again.", "code_attempts_exhausted", field="code"
        )

    cleaned = "".join(character for character in code if character.isdigit())
    if not hmac.compare_digest(record.code_hash, _hash_code(record.challenge_id, cleaned)):
        record.attempts += 1
        db.commit()
        remaining = max(settings.verification_max_attempts - record.attempts, 0)
        if remaining == 0:
            raise UnprocessableEntity(
                "Too many wrong codes. Please start again.", "code_attempts_exhausted", field="code"
            )
        raise UnprocessableEntity("That code is not right. Check the email and try again.", "code_invalid", field="code")

    record.consumed_at = now
    db.commit()
    return record


def read_payload(record: VerificationCode) -> dict:
    if not record.payload:
        return {}
    try:
        data = json.loads(record.payload)
    except ValueError:  # pragma: no cover - only reachable if the row was edited by hand
        return {}
    return data if isinstance(data, dict) else {}


def purge_expired(db: Session) -> int:
    """Delete codes that can no longer be used. Called by the scheduled clean-up."""
    cutoff = utcnow() - RETENTION
    deleted = db.execute(
        delete(VerificationCode).where(
            or_(VerificationCode.expires_at < cutoff, VerificationCode.consumed_at < cutoff)
        )
    ).rowcount
    db.commit()
    return deleted
