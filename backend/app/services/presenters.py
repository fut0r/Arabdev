"""Turn ORM objects into response schemas.

Viewer-dependent fields (liked, is_following, ...) are loaded with one query per page,
never one query per row.
"""

from sqlalchemy.orm import Session

from app.models import Comment, Draft, Media, Notification, Post, User
from app.repositories import posts as posts_repo
from app.repositories import users as users_repo
from app.schemas.comment import CommentOut, ReplyOut
from app.schemas.misc import MediaOut
from app.schemas.notification import NotificationOut
from app.schemas.post import DraftOut, ImageOut, PostOut, PostRef, TagOut
from app.schemas.user import InterestOut, MeOut, ProfileOut, SettingsOut, UserCard, UserSummary
from app.services.media_service import media_url
from app.utils.html import excerpt, reading_minutes


def avatar_url(user: User) -> str | None:
    return media_url(user.profile.avatar) if user.profile else None


def user_summary(user: User) -> UserSummary:
    return UserSummary(
        id=user.id, username=user.username, display_name=user.display_name, avatar_url=avatar_url(user)
    )


def interests_out(user: User) -> list[InterestOut]:
    return [InterestOut.model_validate(interest) for interest in user.interests]


def user_cards(db: Session, users: list[User], viewer_id: int | None) -> list[UserCard]:
    ids = [user.id for user in users]
    followers = users_repo.follower_counts(db, ids)
    following = users_repo.viewer_follows(db, viewer_id, ids)
    follows_you = users_repo.follows_viewer(db, viewer_id, ids)
    return [
        UserCard(
            **user_summary(user).model_dump(),
            bio=user.profile.bio if user.profile else None,
            interests=interests_out(user),
            followers_count=followers.get(user.id, 0),
            is_following=user.id in following,
            follows_you=user.id in follows_you,
        )
        for user in users
    ]


def profile_out(db: Session, user: User, viewer: User | None) -> ProfileOut:
    viewer_id = viewer.id if viewer else None
    card = user_cards(db, [user], viewer_id)[0]
    settings = users_repo.get_settings(db, user)
    is_me = viewer_id == user.id
    return ProfileOut(
        **card.model_dump(),
        location=user.profile.location if user.profile else None,
        website=user.profile.website if user.profile else None,
        created_at=user.created_at,
        following_count=users_repo.following_counts(db, [user.id]).get(user.id, 0),
        posts_count=users_repo.post_counts(db, [user.id]).get(user.id, 0),
        is_me=is_me,
        follow_lists_visible=is_me or settings.show_follow_lists,
    )


def me_out(db: Session, user: User) -> MeOut:
    settings = users_repo.get_settings(db, user)
    profile = user.profile
    return MeOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        bio=profile.bio if profile else None,
        location=profile.location if profile else None,
        website=profile.website if profile else None,
        avatar_url=avatar_url(user),
        interests=interests_out(user),
        onboarding_completed=user.onboarding_completed,
        email_verified=user.email_verified_at is not None,
        is_admin=user.is_admin,
        created_at=user.created_at,
        followers_count=users_repo.follower_counts(db, [user.id]).get(user.id, 0),
        following_count=users_repo.following_counts(db, [user.id]).get(user.id, 0),
        settings=SettingsOut.model_validate(settings),
    )


def image_out(media: Media | None) -> ImageOut | None:
    if media is None:
        return None
    return ImageOut(id=media.id, url=media_url(media) or "", width=media.width, height=media.height)


def media_out(media: Media) -> MediaOut:
    return MediaOut(
        id=media.id,
        kind=media.kind,
        url=media_url(media) or "",
        width=media.width,
        height=media.height,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
    )


def post_outs(
    db: Session,
    posts: list[Post],
    viewer_id: int | None,
    reposted_by: dict[int, User] | None = None,
) -> list[PostOut]:
    liked, bookmarked, reposted = posts_repo.viewer_state(db, viewer_id, [post.id for post in posts])
    reposted_by = reposted_by or {}
    result = []
    for post in posts:
        reposter = reposted_by.get(post.id)
        result.append(
            PostOut(
                id=post.id,
                title=post.title,
                content_html=post.content_html,
                link_url=post.link_url,
                image=image_out(post.image),
                tags=[TagOut(slug=tag.slug, name=tag.name) for tag in post.tags],
                author=user_summary(post.author),
                created_at=post.created_at,
                updated_at=post.updated_at,
                edited_at=post.edited_at,
                likes_count=post.likes_count,
                comments_count=post.comments_count,
                reposts_count=post.reposts_count,
                reading_minutes=reading_minutes(post.content_text),
                liked=post.id in liked,
                bookmarked=post.id in bookmarked,
                reposted=post.id in reposted,
                reposted_by=user_summary(reposter) if reposter else None,
            )
        )
    return result


def post_ref(post: Post) -> PostRef:
    return PostRef(
        id=post.id,
        title=post.title,
        excerpt=excerpt(post.content_text, 120),
        author_username=post.author.username,
    )


def comment_out(comment: Comment, viewer_id: int | None, post_author_id: int | None = None) -> CommentOut:
    can_delete = viewer_id is not None and viewer_id in (comment.author_id, post_author_id)
    return CommentOut(
        id=comment.id,
        post_id=comment.post_id,
        parent_id=comment.parent_id,
        content=comment.content,
        author=user_summary(comment.author),
        created_at=comment.created_at,
        can_delete=can_delete,
    )


def reply_out(comment: Comment, viewer_id: int | None) -> ReplyOut:
    base = comment_out(comment, viewer_id, comment.post.author_id)
    return ReplyOut(**base.model_dump(), post=post_ref(comment.post))


def notification_out(notification: Notification) -> NotificationOut:
    return NotificationOut(
        id=notification.id,
        type=notification.type,  # type: ignore[arg-type]
        actor=user_summary(notification.actor),
        post=post_ref(notification.post) if notification.post else None,
        comment_excerpt=excerpt(notification.comment.content, 140) if notification.comment else None,
        is_read=notification.is_read,
        created_at=notification.created_at,
    )


def draft_out(draft: Draft) -> DraftOut:
    return DraftOut(
        id=draft.id,
        title=draft.title,
        content_html=draft.content_html,
        link_url=draft.link_url,
        image=image_out(draft.image),
        tags=list(draft.tag_names or []),
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )
