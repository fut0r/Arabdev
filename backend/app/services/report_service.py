"""Reports: members flag posts, moderators decide.

1. Someone reports a post with a reason. The author is emailed that it was reported (never by
   whom), and the moderators get the details with a link to decide.
2. When enough different people report the same post it is hidden from everyone else until a
   moderator decides, so a harmful post stops spreading even at night.
3. A moderator dismisses the case, removes the post, restricts the author from publishing for a
   number of days, or suspends the account, with an optional note for the author. Every open
   report on that post is closed with the same decision, and both the author and the people who
   reported are told the outcome.
"""

import logging
from collections import OrderedDict
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.core.permissions import is_admin, is_restricted
from app.models import Post, Report, User
from app.repositories import users as users_repo
from app.schemas.common import Page
from app.schemas.report import (
    DecisionIn,
    DecisionOut,
    ModerationSummary,
    ReportAck,
    ReportCase,
    ReportCreate,
    ReportedAuthor,
    ReportItem,
    RestrictedAccount,
)
from app.services import email_service, presenters
from app.services.post_service import get_visible_post_or_404, remove_post
from app.utils.html import excerpt
from app.utils.pagination import PageParams
from app.utils.time import utcnow

logger = logging.getLogger("arabdev.reports")

# One account may file this many reports a day, however many networks it uses.
DAILY_REPORTS_PER_ACCOUNT = 20
# Open reports are few; this only bounds the query if something floods them.
MAX_OPEN_REPORTS = 2000

_AR_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]  # fmt: skip


def format_date(moment: datetime, language: str) -> str:
    if language == "ar":
        return f"{moment.day} {_AR_MONTHS[moment.month - 1]} {moment.year}"
    return f"{moment.day} {moment.strftime('%B')} {moment.year}"


def _language(db: Session, user: User) -> str:
    return users_repo.get_settings(db, user).language


def _safely(action: str, send) -> None:
    """Email is best effort here: a report or a decision must never fail because mail did."""
    try:
        send()
    except Exception:  # pragma: no cover - depends on the mail provider
        logger.warning("Could not send the %s email", action, exc_info=True)


# ---------------------------------------------------------------- reporting


def create(db: Session, reporter: User, post_id: int, data: ReportCreate) -> ReportAck:
    post = get_visible_post_or_404(db, post_id, reporter)
    if post.author_id == reporter.id:
        raise BadRequest("You can't report your own post", "cannot_report_own")

    existing = db.scalar(select(Report).where(Report.post_id == post.id, Report.reporter_id == reporter.id))
    if existing is not None:
        return ReportAck(detail="You already reported this post. The team will review it.", already_reported=True)

    rate_limit.limit_identifier("report_account", str(reporter.id), DAILY_REPORTS_PER_ACCOUNT, 86400)

    open_before = db.scalar(
        select(func.count()).select_from(Report).where(Report.post_id == post.id, Report.status == "open")
    ) or 0
    report = Report(
        post_id=post.id,
        post_author_id=post.author_id,
        reporter_id=reporter.id,
        reason=data.reason,
        details=data.details,
        post_title=post.title,
        post_excerpt=excerpt(post.content_text, 280),
    )
    db.add(report)
    db.flush()

    author = post.author
    open_now = open_before + 1
    newly_hidden = (
        post.hidden_at is None
        and open_now >= settings.report_auto_hide_threshold
        and not is_admin(author)
    )
    if newly_hidden:
        post.hidden_at = utcnow()
    db.commit()

    language = _language(db, author)
    if open_before == 0:
        _safely("report received", lambda: email_service.send_report_received(
            author.email, language, post.title, data.reason, hidden=newly_hidden
        ))
    elif newly_hidden:
        _safely("post hidden", lambda: email_service.send_post_hidden(author.email, language, post.title))
    _safely("moderator", lambda: email_service.send_report_to_moderators(
        report_id=report.id,
        post_id=post.id,
        post_title=post.title,
        post_excerpt=report.post_excerpt,
        reason=data.reason,
        details=data.details,
        reporter=reporter.username,
        author=author.username,
        open_reports=open_now,
        hidden=post.hidden_at is not None,
    ))
    return ReportAck(detail="Thanks. The ArabDev team will review this post.")


# ---------------------------------------------------------------- reviewing


def _users(db: Session, ids) -> dict[int, User]:
    return users_repo.get_users_by_ids(db, [user_id for user_id in ids if user_id is not None])


def _item(report: Report, users: dict[int, User]) -> ReportItem:
    reporter = users.get(report.reporter_id) if report.reporter_id else None
    moderator = users.get(report.moderator_id) if report.moderator_id else None
    return ReportItem(
        id=report.id,
        reason=report.reason,  # type: ignore[arg-type]
        details=report.details,
        reporter=presenters.user_summary(reporter) if reporter else None,
        created_at=report.created_at,
        status=report.status,  # type: ignore[arg-type]
        action=report.action,
        resolution_note=report.resolution_note,
        resolved_at=report.resolved_at,
        moderator=presenters.user_summary(moderator) if moderator else None,
    )


def _author(user: User | None) -> ReportedAuthor | None:
    if user is None:
        return None
    summary = presenters.user_summary(user)
    return ReportedAuthor(
        **summary.model_dump(),
        restricted_until=user.restricted_until if is_restricted(user) else None,
        suspended=not user.is_active,
        is_admin=is_admin(user),
    )


def _cases(db: Session, viewer: User, groups: list[list[Report]]) -> list[ReportCase]:
    reports = [report for group in groups for report in group]
    users = _users(
        db,
        {r.reporter_id for r in reports} | {r.moderator_id for r in reports} | {r.post_author_id for r in reports},
    )
    post_ids = [group[0].post_id for group in groups if group[0].post_id is not None]
    posts = {post.id: post for post in db.scalars(select(Post).where(Post.id.in_(post_ids))).unique()} if post_ids else {}
    outs = presenters.post_outs(db, list(posts.values()), viewer.id)
    post_outs = {out.id: out for out in outs}
    cases = []
    for group in groups:
        first = group[0]
        post = posts.get(first.post_id) if first.post_id else None
        cases.append(
            ReportCase(
                case_id=first.id,
                post_id=first.post_id,
                post=post_outs.get(first.post_id) if first.post_id else None,
                post_title=first.post_title,
                post_excerpt=first.post_excerpt,
                author=_author(users.get(first.post_author_id) if first.post_author_id else None),
                hidden=post is not None and post.hidden_at is not None,
                reports=[_item(report, users) for report in group],
                first_reported_at=first.created_at,
            )
        )
    return cases


def _open_groups(db: Session) -> "OrderedDict[str, list[Report]]":
    """Open reports, one group per post (a report whose post is gone stands alone)."""
    reports = db.scalars(
        select(Report).where(Report.status == "open").order_by(Report.created_at, Report.id).limit(MAX_OPEN_REPORTS)
    )
    groups: OrderedDict[str, list[Report]] = OrderedDict()
    for report in reports:
        key = f"post:{report.post_id}" if report.post_id is not None else f"report:{report.id}"
        groups.setdefault(key, []).append(report)
    return groups


def _decision_key(report: Report) -> tuple:
    # One decision closes every open report on a post at the same instant. The post id may be
    # gone by now (removed posts), so the rest of the snapshot identifies the case.
    return (report.resolved_at, report.moderator_id, report.post_author_id, report.post_title)


def _resolved_groups(db: Session) -> "OrderedDict[tuple, list[Report]]":
    """Past decisions, newest first, with the reports each one closed."""
    reports = db.scalars(
        select(Report)
        .where(Report.status != "open")
        .order_by(Report.resolved_at.desc(), Report.id)
        .limit(MAX_OPEN_REPORTS)
    )
    groups: OrderedDict[tuple, list[Report]] = OrderedDict()
    for report in reports:
        groups.setdefault(_decision_key(report), []).append(report)
    return groups


def list_cases(db: Session, viewer: User, status: str, params: PageParams) -> Page[ReportCase]:
    groups = list((_open_groups(db) if status == "open" else _resolved_groups(db)).values())
    page = groups[params.offset : params.offset + params.limit]
    return Page.build(_cases(db, viewer, page), params.page, params.limit, len(groups))


def get_case(db: Session, viewer: User, report_id: int) -> ReportCase:
    report = db.get(Report, report_id)
    if report is None:
        raise NotFound("This report doesn't exist", "report_not_found")
    if report.status == "open" and report.post_id is not None:
        group = _open_groups(db).get(f"post:{report.post_id}", [report])
    elif report.status != "open":
        # Opened from an email after someone else decided it: show that decision.
        key = _decision_key(report)
        group = list(
            db.scalars(
                select(Report)
                .where(Report.status != "open", Report.resolved_at == report.resolved_at)
                .order_by(Report.id)
            )
        )
        group = [item for item in group if _decision_key(item) == key] or [report]
    else:
        group = [report]
    return _cases(db, viewer, [group])[0]


def summary(db: Session) -> ModerationSummary:
    groups = _open_groups(db)
    return ModerationSummary(open_cases=len(groups), open_reports=sum(len(group) for group in groups.values()))


# ---------------------------------------------------------------- deciding


def decide(db: Session, moderator: User, report_id: int, data: DecisionIn) -> DecisionOut:
    from app.services.auth_service import revoke_all_sessions  # auth_service imports far more

    report = db.get(Report, report_id)
    if report is None:
        raise NotFound("This report doesn't exist", "report_not_found")
    if report.status != "open":
        raise Conflict("This report was already decided", "report_already_resolved")

    if report.post_id is not None:
        case = list(db.scalars(select(Report).where(Report.post_id == report.post_id, Report.status == "open")))
    else:
        case = [report]
    post = db.get(Post, report.post_id) if report.post_id is not None else None
    author = db.get(User, report.post_author_id) if report.post_author_id is not None else None
    if data.author_action != "none" and author is not None and is_admin(author):
        raise Forbidden("Moderators can't restrict or suspend another moderator", "cannot_moderate_admin")

    now = utcnow()
    actions: list[str] = []
    title = post.title if post is not None else report.post_title
    if data.remove_post and post is not None:
        remove_post(db, post)
        actions.append("post_removed")
    elif post is not None:
        post.hidden_at = None  # kept after review: visible to everyone again

    restricted_until: datetime | None = None
    if author is not None and data.author_action == "restrict":
        restricted_until = now + timedelta(days=data.restrict_days)
        author.restricted_until = restricted_until
        author.restriction_reason = data.note
        actions.append("author_restricted")
    elif author is not None and data.author_action == "suspend":
        author.is_active = False
        author.restriction_reason = data.note
        revoke_all_sessions(db, author)
        actions.append("author_suspended")

    status = "actioned" if actions else "dismissed"
    for item in case:
        item.status = status
        item.action = ",".join(actions) or None
        item.resolution_note = data.note
        item.moderator_id = moderator.id
        item.resolved_at = now
    db.commit()

    if author is not None:
        language = _language(db, author)
        _safely("decision", lambda: email_service.send_decision_to_author(
            author.email,
            language,
            title,
            removed="post_removed" in actions,
            restricted_until=format_date(restricted_until, language) if restricted_until else None,
            suspended="author_suspended" in actions,
            note=data.note,
        ))
    reporters = _users(db, {item.reporter_id for item in case})
    for reporter in reporters.values():
        language = _language(db, reporter)
        _safely("reporter outcome", lambda reporter=reporter, language=language: email_service.send_decision_to_reporter(
            reporter.email, language, title, action_taken=bool(actions)
        ))
    return DecisionOut(status=status, actions=actions, reports_resolved=len(case))  # type: ignore[arg-type]


def restricted_accounts(db: Session) -> list[RestrictedAccount]:
    now = utcnow()
    users = db.scalars(
        select(User)
        .where(or_(User.restricted_until > now, User.is_active.is_(False)))
        .order_by(User.username)
    ).unique()
    return [
        RestrictedAccount(
            **presenters.user_summary(user).model_dump(),
            restricted_until=user.restricted_until if is_restricted(user) else None,
            restriction_reason=user.restriction_reason,
            suspended=not user.is_active,
        )
        for user in users
    ]


def lift(db: Session, user_id: int) -> RestrictedAccount:
    """End a restriction or a suspension early."""
    user = db.get(User, user_id)
    if user is None:
        raise NotFound("This account doesn't exist", "user_not_found")
    user.restricted_until = None
    user.restriction_reason = None
    user.is_active = True
    db.commit()
    return RestrictedAccount(**presenters.user_summary(user).model_dump())


def purge_resolved(db: Session) -> int:
    """Delete decided reports once they are older than the retention period."""
    cutoff = utcnow() - timedelta(days=settings.report_retention_days)
    deleted = db.execute(delete(Report).where(Report.status != "open", Report.resolved_at < cutoff)).rowcount
    db.commit()
    return deleted
