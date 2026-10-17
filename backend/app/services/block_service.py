"""Blocking another member.

A block is private and one-sided to set up, but it separates both accounts:

* neither can follow the other (existing follows in both directions are removed),
* neither can comment on, reply to or repost the other's posts,
* neither is notified about anything the other does, mentions included, and the blocker's
  existing notifications from the other account are cleared,
* the blocker stops seeing the blocked account's posts and comments, and stops being
  suggested it.

Posts stay public, so a blocked member can still read them while signed out; a block is about
contact, not secrecy.
"""

from sqlalchemy import ColumnElement, Select, delete, exists, or_, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequest, Forbidden, NotFound
from app.models import Block, Follow, Notification, User
from app.repositories import users as users_repo
from app.schemas.common import Page
from app.schemas.user import UserCard
from app.services import presenters
from app.utils.pagination import PageParams, paginate_scalars


def blocked_by(viewer_id: int) -> Select:
    """The ids of the accounts `viewer_id` has blocked, for use in a query."""
    return select(Block.blocked_id).where(Block.blocker_id == viewer_id)


def not_blocked_by(viewer_id: int | None, author_column) -> ColumnElement[bool] | None:
    """A filter that leaves out what the viewer blocked, or None for signed-out visitors."""
    if viewer_id is None:
        return None
    return author_column.not_in(blocked_by(viewer_id))


def between(db: Session, first_id: int, second_id: int) -> bool:
    """Whether either account has blocked the other."""
    return bool(
        db.scalar(
            select(
                exists().where(
                    or_(
                        (Block.blocker_id == first_id) & (Block.blocked_id == second_id),
                        (Block.blocker_id == second_id) & (Block.blocked_id == first_id),
                    )
                )
            )
        )
    )


def ensure_can_interact(db: Session, user_id: int, other_id: int) -> None:
    if user_id != other_id and between(db, user_id, other_id):
        raise Forbidden("You can't interact with this account", "blocked")


def has_blocked(db: Session, blocker_id: int, blocked_id: int) -> bool:
    return db.get(Block, (blocker_id, blocked_id)) is not None


def block(db: Session, viewer: User, target_id: int) -> None:
    if viewer.id == target_id:
        raise BadRequest("You can't block yourself", "cannot_block_self")
    target = users_repo.get_by_id(db, target_id)
    if target is None:
        raise NotFound("This account doesn't exist", "user_not_found")
    if not has_blocked(db, viewer.id, target_id):
        db.add(Block(blocker_id=viewer.id, blocked_id=target_id))
    db.execute(
        delete(Follow).where(
            or_(
                (Follow.follower_id == viewer.id) & (Follow.followee_id == target_id),
                (Follow.follower_id == target_id) & (Follow.followee_id == viewer.id),
            )
        )
    )
    # What they did before the block should not stay in the blocker's notifications either.
    db.execute(delete(Notification).where(Notification.recipient_id == viewer.id, Notification.actor_id == target_id))
    db.commit()


def unblock(db: Session, viewer: User, target_id: int) -> None:
    db.execute(delete(Block).where(Block.blocker_id == viewer.id, Block.blocked_id == target_id))
    db.commit()


def list_blocked(db: Session, viewer: User, params: PageParams) -> Page[UserCard]:
    stmt = (
        select(User)
        .join(Block, Block.blocked_id == User.id)
        .where(Block.blocker_id == viewer.id)
        .order_by(Block.created_at.desc())
    )
    users, total = paginate_scalars(db, stmt, params)
    return Page.build(presenters.user_cards(db, users, viewer.id), params.page, params.limit, total)
