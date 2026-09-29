from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.post import PostOut
from app.schemas.user import UserSummary

ReportReason = Literal[
    "spam",
    "harassment",
    "hate",
    "sexual",
    "violence",
    "misinformation",
    "personal_info",
    "copyright",
    "other",
]


class ReportCreate(BaseModel):
    reason: ReportReason
    details: str | None = Field(default=None, max_length=1000)

    @field_validator("details")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None


class ReportAck(BaseModel):
    detail: str
    # True when this person had already reported the post; nothing new was sent.
    already_reported: bool = False


class ReportItem(BaseModel):
    id: int
    reason: ReportReason
    details: str | None = None
    reporter: UserSummary | None = None
    created_at: datetime
    status: Literal["open", "dismissed", "actioned"]
    action: str | None = None
    resolution_note: str | None = None
    resolved_at: datetime | None = None
    moderator: UserSummary | None = None


class ReportedAuthor(UserSummary):
    restricted_until: datetime | None = None
    suspended: bool = False
    is_admin: bool = False


class ReportCase(BaseModel):
    """Every open report about one post, decided together."""

    case_id: int  # the id of the case's first report; decisions are sent to it
    post_id: int | None = None
    # The live post, when it still exists; otherwise only the copied title and excerpt remain.
    post: PostOut | None = None
    post_title: str | None = None
    post_excerpt: str = ""
    author: ReportedAuthor | None = None
    hidden: bool = False
    reports: list[ReportItem]
    first_reported_at: datetime


class DecisionIn(BaseModel):
    remove_post: bool = False
    author_action: Literal["none", "restrict", "suspend"] = "none"
    restrict_days: int = Field(default=7, ge=1, le=365)
    # Sent to the author with the decision, so it must not contain internal notes.
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None


class DecisionOut(BaseModel):
    status: Literal["dismissed", "actioned"]
    actions: list[str]
    reports_resolved: int


class ModerationSummary(BaseModel):
    open_cases: int
    open_reports: int


class RestrictedAccount(UserSummary):
    restricted_until: datetime | None = None
    restriction_reason: str | None = None
    suspended: bool = False
