from collections.abc import Iterable

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models import Block, Follow, Post, Profile, User, UserSettings, user_interests
from app.utils.text import escape_like


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username.strip().lstrip("@").lower()))


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def username_taken(db: Session, username: str, exclude_id: int | None = None) -> bool:
    stmt = select(User.id).where(User.username == username)
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    return db.scalar(stmt.limit(1)) is not None


def email_taken(db: Session, email: str, exclude_id: int | None = None) -> bool:
    stmt = select(User.id).where(User.email == email)
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    return db.scalar(stmt.limit(1)) is not None


def create_user(db: Session, *, username: str, email: str, hashed_password: str, language: str = "ar") -> User:
    user = User(username=username, email=email, hashed_password=hashed_password)
    user.profile = Profile(display_name=username)
    user.settings = UserSettings(language=language)
    db.add(user)
    db.flush()
    return user


def get_settings(db: Session, user: User) -> UserSettings:
    if user.settings is None:
        user.settings = UserSettings()
        db.flush()
    return user.settings


def _grouped_counts(db: Session, column, filter_column, ids: Iterable[int]) -> dict[int, int]:
    ids = list(set(ids))
    if not ids:
        return {}
    rows = db.execute(
        select(filter_column, func.count(column)).where(filter_column.in_(ids)).group_by(filter_column)
    ).all()
    return {row[0]: row[1] for row in rows}


def follower_counts(db: Session, ids: Iterable[int]) -> dict[int, int]:
    return _grouped_counts(db, Follow.follower_id, Follow.followee_id, ids)


def following_counts(db: Session, ids: Iterable[int]) -> dict[int, int]:
    return _grouped_counts(db, Follow.followee_id, Follow.follower_id, ids)


def post_counts(db: Session, ids: Iterable[int]) -> dict[int, int]:
    return _grouped_counts(db, Post.id, Post.author_id, ids)


def viewer_follows(db: Session, viewer_id: int | None, ids: Iterable[int]) -> set[int]:
    ids = list(set(ids))
    if viewer_id is None or not ids:
        return set()
    return set(
        db.scalars(select(Follow.followee_id).where(Follow.follower_id == viewer_id, Follow.followee_id.in_(ids)))
    )


def follows_viewer(db: Session, viewer_id: int | None, ids: Iterable[int]) -> set[int]:
    ids = list(set(ids))
    if viewer_id is None or not ids:
        return set()
    return set(
        db.scalars(select(Follow.follower_id).where(Follow.followee_id == viewer_id, Follow.follower_id.in_(ids)))
    )


def get_users_by_ids(db: Session, ids: Iterable[int]) -> dict[int, User]:
    ids = list(set(ids))
    if not ids:
        return {}
    return {user.id: user for user in db.scalars(select(User).where(User.id.in_(ids))).unique()}


def get_users_by_usernames(db: Session, usernames: Iterable[str]) -> list[User]:
    names = [name.lower() for name in set(usernames)]
    if not names:
        return []
    return list(db.scalars(select(User).where(User.username.in_(names), User.is_active.is_(True))).unique())


def followers_stmt(user_id: int) -> Select:
    return (
        select(User)
        .join(Follow, Follow.follower_id == User.id)
        .where(Follow.followee_id == user_id, User.is_active.is_(True))
        .order_by(Follow.created_at.desc())
    )


def following_stmt(user_id: int) -> Select:
    return (
        select(User)
        .join(Follow, Follow.followee_id == User.id)
        .where(Follow.follower_id == user_id, User.is_active.is_(True))
        .order_by(Follow.created_at.desc())
    )


def search_stmt(query: str) -> Select:
    pattern = f"%{escape_like(query)}%"
    exact = func.lower(User.username) == query.lower()
    return (
        select(User)
        .join(Profile, Profile.user_id == User.id)
        .join(UserSettings, UserSettings.user_id == User.id)
        .where(
            User.is_active.is_(True),
            or_(UserSettings.discoverable.is_(True), exact),
            or_(User.username.ilike(pattern, escape="\\"), Profile.display_name.ilike(pattern, escape="\\")),
        )
        .order_by(exact.desc(), User.created_at.desc())
    )


def recommended_stmt(viewer_id: int | None, interest_ids: list[int], limit: int) -> Select:
    """Developers ranked by shared interests and by how many people the viewer follows follow them."""
    followers = (
        select(Follow.followee_id.label("uid"), func.count().label("followers"))
        .group_by(Follow.followee_id)
        .subquery("followers")
    )
    stmt = (
        select(User)
        .join(UserSettings, UserSettings.user_id == User.id)
        .outerjoin(followers, followers.c.uid == User.id)
        .where(User.is_active.is_(True), UserSettings.discoverable.is_(True))
    )
    follower_rank = func.coalesce(followers.c.followers, 0)

    if viewer_id is None:
        return stmt.order_by(follower_rank.desc(), User.created_at.desc()).limit(limit)

    followed = select(Follow.followee_id).where(Follow.follower_id == viewer_id)
    shared = (
        select(user_interests.c.user_id.label("uid"), func.count().label("shared"))
        .where(user_interests.c.interest_id.in_(interest_ids))
        .group_by(user_interests.c.user_id)
        .subquery("shared")
    )
    mutual = (
        select(Follow.followee_id.label("uid"), func.count().label("mutual"))
        .where(Follow.follower_id.in_(followed))
        .group_by(Follow.followee_id)
        .subquery("mutual")
    )
    score = func.coalesce(shared.c.shared, 0) * 3 + func.coalesce(mutual.c.mutual, 0) * 2
    return (
        stmt.outerjoin(shared, shared.c.uid == User.id)
        .outerjoin(mutual, mutual.c.uid == User.id)
        .where(
            User.id != viewer_id,
            User.id.not_in(followed),
            User.id.not_in(select(Block.blocked_id).where(Block.blocker_id == viewer_id)),
            User.id.not_in(select(Block.blocker_id).where(Block.blocked_id == viewer_id)),
        )
        .order_by(score.desc(), follower_rank.desc(), User.created_at.desc())
        .limit(limit)
    )
