from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, false, text, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.types import ID, UTCDateTime
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.interest import Interest
    from app.models.media import Media


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Bumped on password change so outstanding access tokens stop working.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    password_changed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    profile: Mapped["Profile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="joined"
    )
    settings: Mapped["UserSettings"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="select"
    )
    interests: Mapped[list["Interest"]] = relationship(
        secondary="user_interests", lazy="selectin", order_by="Interest.position"
    )

    @property
    def display_name(self) -> str:
        if self.profile and self.profile.display_name:
            return self.profile.display_name
        return self.username


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(50))
    bio: Mapped[str | None] = mapped_column(String(280), nullable=True)
    location: Mapped[str | None] = mapped_column(String(60), nullable=True)
    website: Mapped[str | None] = mapped_column(String(200), nullable=True)
    avatar_media_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("media.id", ondelete="SET NULL"), nullable=True, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="profile")
    avatar: Mapped["Media | None"] = relationship(foreign_keys=[avatar_media_id], lazy="joined")


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme: Mapped[str] = mapped_column(String(10), default="system", server_default="system")
    language: Mapped[str] = mapped_column(String(5), default="ar", server_default="ar")

    # Privacy
    discoverable: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), index=True)
    show_follow_lists: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    mentions_from: Mapped[str] = mapped_column(String(12), default="everyone", server_default="everyone")

    # Reading
    default_feed: Mapped[str] = mapped_column(String(10), default="for_you", server_default="for_you")
    reduce_motion: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    # Account security
    login_code_required: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    # Email preferences
    email_security_alerts: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    email_product_updates: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    # Notification preferences
    notify_likes: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    notify_comments: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    notify_follows: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    notify_reposts: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    notify_mentions: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="settings")
