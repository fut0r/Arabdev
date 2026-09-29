from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.types import ID, UTCDateTime
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.media import Media
    from app.models.tag import Tag
    from app.models.user import User


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (Index("ix_posts_author_id_created_at", "author_id", "created_at"),)

    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Sanitized HTML produced by the rich text editor.
    content_html: Mapped[str] = mapped_column(Text)
    # Plain-text projection of the content, used for search, excerpts and mentions.
    content_text: Mapped[str] = mapped_column(Text)
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_media_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("media.id", ondelete="SET NULL"), nullable=True, index=True
    )
    likes_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    comments_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    reposts_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    edited_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    # Set when enough people report the post: it leaves feeds until a moderator decides.
    hidden_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    author: Mapped["User"] = relationship(lazy="joined", innerjoin=True)
    image: Mapped["Media | None"] = relationship(lazy="joined")
    tags: Mapped[list["Tag"]] = relationship(secondary="post_tags", lazy="selectin", order_by="Tag.slug")


class Draft(Base):
    __tablename__ = "drafts"
    __table_args__ = (Index("ix_drafts_author_id_updated_at", "author_id", "updated_at"),)

    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    content_html: Mapped[str] = mapped_column(Text, default="")
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_media_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("media.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Tags are free text until the draft is published; they become relational tags on publish.
    tag_names: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    image: Mapped["Media | None"] = relationship(lazy="joined")
