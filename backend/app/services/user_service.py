from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, UnprocessableEntity
from app.core.security import verify_password
from app.models import Bookmark, Comment, Draft, Follow, Interest, Like, Post, Repost, User
from app.repositories import users as users_repo
from app.schemas.common import Page
from app.schemas.user import (
    FollowState,
    ProfileOut,
    ProfileUpdate,
    SettingsUpdate,
    UserCard,
)
from app.services import (
    email_service,
    media_service,
    notification_service,
    post_service,
    presenters,
    verification_service,
)
from app.services.storage import get_storage
from app.services.verification_service import Challenge
from app.utils.pagination import PageParams, paginate_scalars
from app.utils.time import utcnow


def get_by_username_or_404(db: Session, username: str) -> User:
    user = users_repo.get_by_username(db, username)
    if user is None or not user.is_active:
        raise NotFound("This account doesn't exist", "user_not_found")
    return user


def update_profile(db: Session, user: User, data: ProfileUpdate) -> User:
    profile = user.profile
    profile.display_name = data.display_name
    profile.bio = data.bio
    profile.location = data.location
    profile.website = data.website
    db.commit()
    return user


def update_username(db: Session, user: User, username: str) -> User:
    if username == user.username:
        return user
    if users_repo.username_taken(db, username, exclude_id=user.id):
        raise Conflict("Username is already taken", "username_taken", field="username")
    user.username = username
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("Username is already taken", "username_taken", field="username") from None
    return user


def _check_email_change(db: Session, user: User, email: str, current_password: str) -> None:
    if not verify_password(current_password, user.hashed_password):
        raise UnprocessableEntity("Current password is incorrect", "current_password_invalid", field="current_password")
    if email == user.email:
        raise UnprocessableEntity("That is already your email address", "email_unchanged", field="email")
    if users_repo.email_taken(db, email, exclude_id=user.id):
        raise Conflict("An account with this email already exists", "email_taken", field="email")


def update_email(db: Session, user: User, email: str, current_password: str) -> User:
    if email == user.email:
        return user
    _check_email_change(db, user, email, current_password)
    return _apply_new_email(db, user, email)


def _apply_new_email(db: Session, user: User, email: str) -> User:
    previous = user.email
    user.email = email
    user.email_verified_at = utcnow()
    db.commit()
    # The old address deserves to know, even if alerts are switched off: losing an email
    # address quietly is how accounts disappear.
    try:
        email_service.send_security_alert(previous, "email_changed", users_repo.get_settings(db, user).language)
    except Exception:  # pragma: no cover - mail is best effort here
        pass
    return user


def start_email_change(db: Session, user: User, email: str, current_password: str, ip: str | None = None) -> Challenge:
    """Send the code to the new address: confirming it proves the inbox is real and reachable."""
    _check_email_change(db, user, email, current_password)
    return verification_service.start(
        db,
        purpose="email_change",
        email=email,
        language=users_repo.get_settings(db, user).language,
        user_id=user.id,
        payload={"email": email},
        ip=ip,
    )


def complete_email_change(db: Session, user: User, challenge_id: str, code: str) -> User:
    record = verification_service.consume(db, challenge_id, code, purpose="email_change")
    if record.user_id != user.id:
        raise UnprocessableEntity("This confirmation is no longer valid. Please start again.", "code_challenge_invalid")
    email = verification_service.read_payload(record).get("email") or record.email
    if email != user.email and users_repo.email_taken(db, email, exclude_id=user.id):
        raise Conflict("An account with this email already exists", "email_taken", field="email")
    return _apply_new_email(db, user, email)


def update_interests(db: Session, user: User, interest_ids: list[int]) -> User:
    unique_ids = list(dict.fromkeys(interest_ids))
    interests = list(db.scalars(select(Interest).where(Interest.id.in_(unique_ids)))) if unique_ids else []
    if len(interests) != len(unique_ids):
        raise UnprocessableEntity("Some of the selected interests don't exist", "interest_invalid", field="interest_ids")
    user.interests = sorted(interests, key=lambda interest: interest.position)
    db.commit()
    return user


def update_settings(db: Session, user: User, data: SettingsUpdate) -> User:
    settings = users_repo.get_settings(db, user)
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(settings, field, value)
    db.commit()
    return user


def complete_onboarding(db: Session, user: User) -> User:
    user.onboarding_completed = True
    db.commit()
    return user


def set_avatar(db: Session, user: User, raw: bytes) -> User:
    media = media_service.store_image(db, user, raw, "avatar")
    previous_id = user.profile.avatar_media_id
    user.profile.avatar_media_id = media.id
    user.profile.avatar = media
    db.flush()
    media_service.delete_if_orphaned(db, previous_id)
    db.commit()
    return user


def remove_avatar(db: Session, user: User) -> User:
    previous_id = user.profile.avatar_media_id
    user.profile.avatar_media_id = None
    user.profile.avatar = None
    db.flush()
    media_service.delete_if_orphaned(db, previous_id)
    db.commit()
    return user


def delete_account(db: Session, user: User, password: str) -> None:
    if not verify_password(password, user.hashed_password):
        raise UnprocessableEntity("Password is incorrect", "current_password_invalid", field="password")
    keys = media_service.storage_keys_for_user(db, user.id)
    # Counters on other people's posts include this account's likes, reposts and comments.
    affected = (
        set(db.scalars(select(Like.post_id).where(Like.user_id == user.id)))
        | set(db.scalars(select(Repost.post_id).where(Repost.user_id == user.id)))
        | set(db.scalars(select(Comment.post_id).where(Comment.author_id == user.id)))
    )
    db.delete(user)
    db.flush()
    post_service.recount(db, list(affected))
    db.commit()
    storage = get_storage()
    for key in keys:
        storage.delete(key)


def _plain(value):
    """JSON only understands so much; timestamps become ISO strings."""
    return value.isoformat() if isinstance(value, datetime) else value


def export_account(db: Session, user: User) -> dict:
    """Everything this account holds, as plain JSON.

    The privacy policy promises people can take their data with them; this is that
    promise in code. Passwords, tokens and other people's private data stay out.
    """
    account_settings = users_repo.get_settings(db, user)
    posts = list(db.scalars(select(Post).where(Post.author_id == user.id).order_by(Post.created_at)))
    drafts = list(db.scalars(select(Draft).where(Draft.author_id == user.id).order_by(Draft.created_at)))
    comments = list(db.scalars(select(Comment).where(Comment.author_id == user.id).order_by(Comment.created_at)))
    return {
        "exported_at": utcnow().isoformat(),
        "account": {
            "username": user.username,
            "email": user.email,
            "created_at": user.created_at.isoformat(),
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            "email_verified": user.email_verified_at is not None,
        },
        "profile": {
            "display_name": user.profile.display_name,
            "bio": user.profile.bio,
            "location": user.profile.location,
            "website": user.profile.website,
        },
        "settings": {
            column.name: _plain(getattr(account_settings, column.name))
            for column in account_settings.__table__.columns
            if column.name not in ("user_id",)
        },
        "interests": [interest.slug for interest in user.interests],
        "posts": [
            {
                "id": post.id,
                "title": post.title,
                "content_html": post.content_html,
                "tags": [tag.name for tag in post.tags],
                "created_at": post.created_at.isoformat(),
                "likes": post.likes_count,
                "comments": post.comments_count,
            }
            for post in posts
        ],
        "drafts": [
            {"id": draft.id, "title": draft.title, "content_html": draft.content_html,
             "updated_at": draft.updated_at.isoformat()}
            for draft in drafts
        ],
        "comments": [
            {"id": comment.id, "post_id": comment.post_id, "content": comment.content,
             "created_at": comment.created_at.isoformat()}
            for comment in comments
        ],
        "bookmarked_post_ids": list(db.scalars(select(Bookmark.post_id).where(Bookmark.user_id == user.id))),
        "liked_post_ids": list(db.scalars(select(Like.post_id).where(Like.user_id == user.id))),
        "following": list(
            db.scalars(select(User.username).join(Follow, Follow.followee_id == User.id).where(
                Follow.follower_id == user.id
            ))
        ),
    }


def follow(db: Session, viewer: User, target_id: int) -> FollowState:
    if viewer.id == target_id:
        raise BadRequest("You can't follow yourself", "cannot_follow_self")
    target = users_repo.get_by_id(db, target_id)
    if target is None or not target.is_active:
        raise NotFound("This account doesn't exist", "user_not_found")
    exists = db.get(Follow, (viewer.id, target_id))
    if exists is None:
        db.add(Follow(follower_id=viewer.id, followee_id=target_id))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
        else:
            notification_service.notify(db, recipient_id=target_id, actor_id=viewer.id, kind="follow")
        db.commit()
    return FollowState(
        user_id=target_id, following=True, followers_count=users_repo.follower_counts(db, [target_id]).get(target_id, 0)
    )


def unfollow(db: Session, viewer: User, target_id: int) -> FollowState:
    target = users_repo.get_by_id(db, target_id)
    if target is None:
        raise NotFound("This account doesn't exist", "user_not_found")
    db.execute(delete(Follow).where(Follow.follower_id == viewer.id, Follow.followee_id == target_id))
    notification_service.withdraw(db, recipient_id=target_id, actor_id=viewer.id, kind="follow")
    db.commit()
    return FollowState(
        user_id=target_id,
        following=False,
        followers_count=users_repo.follower_counts(db, [target_id]).get(target_id, 0),
    )


def public_profile(db: Session, username: str, viewer: User | None) -> ProfileOut:
    return presenters.profile_out(db, get_by_username_or_404(db, username), viewer)


def _follow_list(db: Session, user: User, viewer: User | None, params: PageParams, stmt) -> Page[UserCard]:
    settings = users_repo.get_settings(db, user)
    if not settings.show_follow_lists and (viewer is None or viewer.id != user.id):
        raise Forbidden("This account keeps its connections private", "follow_lists_private")
    items, total = paginate_scalars(db, stmt, params)
    cards = presenters.user_cards(db, items, viewer.id if viewer else None)
    return Page.build(cards, params.page, params.limit, total)


def followers(db: Session, username: str, viewer: User | None, params: PageParams) -> Page[UserCard]:
    user = get_by_username_or_404(db, username)
    return _follow_list(db, user, viewer, params, users_repo.followers_stmt(user.id))


def following(db: Session, username: str, viewer: User | None, params: PageParams) -> Page[UserCard]:
    user = get_by_username_or_404(db, username)
    return _follow_list(db, user, viewer, params, users_repo.following_stmt(user.id))


def recommended(db: Session, viewer: User | None, limit: int) -> list[UserCard]:
    interest_ids = [interest.id for interest in viewer.interests] if viewer else []
    stmt = users_repo.recommended_stmt(viewer.id if viewer else None, interest_ids, limit)
    users = list(db.scalars(stmt).unique())
    return presenters.user_cards(db, users, viewer.id if viewer else None)
