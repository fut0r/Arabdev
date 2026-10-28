"""Reading collections, authored series and topic subscriptions."""

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.types import ID, UTCDateTime
from app.utils.time import utcnow


class Series(Base):
    __tablename__ = "series"

    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class BookmarkCollection(Base):
    __tablename__ = "bookmark_collections"

    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class TagFollow(Base):
    __tablename__ = "tag_follows"

    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ID, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AcceptedAnswer(Base):
    # A separate table avoids a circular posts -> comments -> posts foreign key.
    __tablename__ = "accepted_answers"

    post_id: Mapped[int] = mapped_column(ID, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True)
    comment_id: Mapped[int] = mapped_column(ID, ForeignKey("comments.id", ondelete="CASCADE"), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class DigestDelivery(Base):
    """A weekly delivery claim prevents concurrent cron runs sending duplicates."""

    __tablename__ = "digest_deliveries"
    __table_args__ = (Index("ix_digest_deliveries_created_at", "created_at"),)

    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    week: Mapped[str] = mapped_column(String(10), primary_key=True)
    status: Mapped[str] = mapped_column(String(12), default="pending")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class GitHubIdentity(Base):
    __tablename__ = "github_identities"
    github_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
