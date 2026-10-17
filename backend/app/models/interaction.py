"""Likes, bookmarks, reposts and follows: one row per (user, target) pair."""

from datetime import datetime

from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.types import ID, UTCDateTime
from app.utils.time import utcnow


class Like(Base):
    __tablename__ = "likes"

    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    post_id: Mapped[int] = mapped_column(ID, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (Index("ix_bookmarks_user_id_created_at", "user_id", "created_at"),)

    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    post_id: Mapped[int] = mapped_column(ID, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Repost(Base):
    __tablename__ = "reposts"
    __table_args__ = (Index("ix_reposts_user_id_created_at", "user_id", "created_at"),)

    user_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    post_id: Mapped[int] = mapped_column(ID, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Follow(Base):
    # Self-follows are rejected in the service layer (cannot_follow_self).
    __tablename__ = "follows"

    follower_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    followee_id: Mapped[int] = mapped_column(
        ID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
