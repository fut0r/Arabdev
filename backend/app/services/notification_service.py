from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models import Follow, Notification, User
from app.repositories import users as users_repo
from app.schemas.common import Page
from app.schemas.notification import NotificationOut
from app.services import presenters
from app.utils.pagination import PageParams, paginate_scalars
from app.utils.text import extract_mentions

_PREFERENCE = {
    "like": "notify_likes",
    "comment": "notify_comments",
    "follow": "notify_follows",
    "repost": "notify_reposts",
    "mention": "notify_mentions",
}


def _wants(db: Session, recipient: User, actor_id: int, kind: str) -> bool:
    settings = users_repo.get_settings(db, recipient)
    if not getattr(settings, _PREFERENCE[kind]):
        return False
    if kind == "mention":
        if settings.mentions_from == "none":
            return False
        if settings.mentions_from == "following":
            follows_actor = db.scalar(
                select(Follow.follower_id).where(Follow.follower_id == recipient.id, Follow.followee_id == actor_id)
            )
            return follows_actor is not None
    return True


def notify(
    db: Session,
    *,
    recipient_id: int,
    actor_id: int,
    kind: str,
    post_id: int | None = None,
    comment_id: int | None = None,
) -> None:
    if recipient_id == actor_id:
        return
    recipient = users_repo.get_by_id(db, recipient_id)
    if recipient is None or not recipient.is_active or not _wants(db, recipient, actor_id, kind):
        return
    if kind in ("like", "follow", "repost"):
        # Toggling a like on and off should not stack up duplicate notifications.
        duplicate = db.scalar(
            select(Notification.id).where(
                Notification.recipient_id == recipient_id,
                Notification.actor_id == actor_id,
                Notification.type == kind,
                Notification.post_id.is_(None) if post_id is None else Notification.post_id == post_id,
            )
        )
        if duplicate is not None:
            return
    db.add(
        Notification(recipient_id=recipient_id, actor_id=actor_id, type=kind, post_id=post_id, comment_id=comment_id)
    )


def withdraw(db: Session, *, recipient_id: int, actor_id: int, kind: str, post_id: int | None = None) -> None:
    """Remove an unread notification when its cause is undone (unlike, unfollow, ...)."""
    stmt = delete(Notification).where(
        Notification.recipient_id == recipient_id,
        Notification.actor_id == actor_id,
        Notification.type == kind,
        Notification.is_read.is_(False),
    )
    if post_id is not None:
        stmt = stmt.where(Notification.post_id == post_id)
    db.execute(stmt)


def notify_mentions(
    db: Session, *, text: str, actor_id: int, post_id: int, comment_id: int | None = None, skip: set[int] = frozenset()
) -> None:
    for user in users_repo.get_users_by_usernames(db, extract_mentions(text)):
        if user.id not in skip:
            notify(db, recipient_id=user.id, actor_id=actor_id, kind="mention", post_id=post_id, comment_id=comment_id)


def list_for(db: Session, user: User, params: PageParams, unread_only: bool = False) -> Page[NotificationOut]:
    stmt = (
        select(Notification)
        .where(Notification.recipient_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    items, total = paginate_scalars(db, stmt, params)
    return Page.build([presenters.notification_out(n) for n in items], params.page, params.limit, total)


def unread_count(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_id == user.id, Notification.is_read.is_(False))
        )
        or 0
    )


def mark_read(db: Session, user: User, notification_id: int) -> None:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.recipient_id != user.id:
        raise NotFound("Notification not found", "notification_not_found")
    notification.is_read = True
    db.commit()


def mark_all_read(db: Session, user: User) -> None:
    db.execute(
        update(Notification)
        .where(Notification.recipient_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
