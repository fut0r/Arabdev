from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.types import ID, UTCDateTime
from app.utils.time import utcnow

REPORT_REASONS = (
    "spam",
    "harassment",
    "hate",
    "sexual",
    "violence",
    "misinformation",
    "personal_info",
    "copyright",
    "other",
)
REPORT_STATUSES = ("open", "dismissed", "actioned")


class Report(Base):
    """Someone flagged a post for the moderators.

    The post's title and a short excerpt are copied in, so the record still makes sense after
    the post is removed. Who reported is kept for the moderators only and is never shown or
    sent to the author.
    """

    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("post_id", "reporter_id", name="uq_reports_post_id_reporter_id"),
        Index("ix_reports_status_created_at", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(ID, primary_key=True, autoincrement=True)
    post_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("posts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    post_author_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reporter_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reason: Mapped[str] = mapped_column(String(20))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    post_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    post_excerpt: Mapped[str] = mapped_column(String(300), default="")

    status: Mapped[str] = mapped_column(String(12), default="open", server_default="open")
    # What the moderators did: any of "post_removed", "author_restricted", "author_suspended",
    # joined with commas, or empty when the report was dismissed.
    action: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Shown to the author in the decision email; internal notes do not belong here.
    resolution_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    moderator_id: Mapped[int | None] = mapped_column(
        ID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
