"""Reporting posts, and the moderators' side of it.

Anyone signed in can report a post. The /admin endpoints are for moderators only: accounts with
is_admin set in the database, or whose username is listed in ADMIN_USERNAMES.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.core.rate_limit import rate_limit
from app.schemas.common import Page
from app.schemas.report import (
    DecisionIn,
    DecisionOut,
    ModerationSummary,
    ReportAck,
    ReportCase,
    ReportCreate,
    RestrictedAccount,
)
from app.services import report_service
from app.utils.pagination import PageParams, page_params

reports = APIRouter(prefix="/posts", tags=["Moderation"])
admin = APIRouter(prefix="/admin", tags=["Moderation"])

Pagination = Annotated[PageParams, Depends(page_params)]


@reports.post(
    "/{post_id}/report",
    response_model=ReportAck,
    summary="Report a post to the moderators",
    description=(
        "The author is emailed that the post was reported (never by whom) and the moderators get the details. "
        "Reporting the same post twice does nothing. Once enough different people report a post it is hidden "
        "until a moderator decides."
    ),
    dependencies=[Depends(rate_limit("report", limit=10, window=3600))],
)
def report_post(post_id: int, data: ReportCreate, db: DbSession, user: CurrentUser) -> ReportAck:
    return report_service.create(db, user, post_id, data)


@admin.get("/summary", response_model=ModerationSummary, summary="How many reports are waiting")
def summary(db: DbSession, _admin: AdminUser) -> ModerationSummary:
    return report_service.summary(db)


@admin.get(
    "/reports",
    response_model=Page[ReportCase],
    summary="Reports to review",
    description="status=open groups every open report on the same post into one case; resolved lists past decisions.",
)
def list_reports(
    db: DbSession,
    moderator: AdminUser,
    params: Pagination,
    status: Literal["open", "resolved"] = "open",
) -> Page[ReportCase]:
    return report_service.list_cases(db, moderator, status, params)


@admin.get("/reports/{report_id}", response_model=ReportCase, summary="One report and the others on the same post")
def get_report(report_id: int, db: DbSession, moderator: AdminUser) -> ReportCase:
    return report_service.get_case(db, moderator, report_id)


@admin.post(
    "/reports/{report_id}/decision",
    response_model=DecisionOut,
    summary="Decide a case",
    description=(
        "Closes every open report on the same post. remove_post deletes it; otherwise a hidden post is shown again. "
        "author_action restricts the author from publishing for restrict_days, or suspends the account. "
        "The note is emailed to the author."
    ),
)
def decide(report_id: int, data: DecisionIn, db: DbSession, moderator: AdminUser) -> DecisionOut:
    return report_service.decide(db, moderator, report_id, data)


@admin.get("/restricted", response_model=list[RestrictedAccount], summary="Restricted and suspended accounts")
def restricted(db: DbSession, _admin: AdminUser) -> list[RestrictedAccount]:
    return report_service.restricted_accounts(db)


@admin.post("/users/{user_id}/lift", response_model=RestrictedAccount, summary="End a restriction or suspension")
def lift(user_id: int, db: DbSession, _admin: AdminUser) -> RestrictedAccount:
    return report_service.lift(db, user_id)
