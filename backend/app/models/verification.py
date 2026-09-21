from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.types import ID, UTCDateTime
from app.utils.time import utcnow

# What a code was asked for. The purpose decides what happens once it is accepted.
VERIFICATION_PURPOSES = ("register", "login", "email_change", "password_change")


class VerificationCode(Base):
    """A six-digit code emailed to prove someone reads the inbox they claim.

    Only a hash of the code is stored, the same way passwords are. The client holds an
    opaque challenge id instead of the email address, so a leaked id reveals nothing and
    codes cannot be tried against an address the caller guessed.
    """

    __tablename__ = "verification_codes"

    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    challenge_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(20), index=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    user_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    code_hash: Mapped[str] = mapped_column(String(64))
    # JSON with what to apply once the code is accepted (the pending account, the new
    # email, the new password hash). Never contains a plain-text password.
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(5), default="ar", server_default="ar")
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    resends: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
