"""Import every model so SQLAlchemy's registry (and Alembic autogenerate) sees all tables."""

from app.models.ad import Ad
from app.models.comment import Comment
from app.models.interaction import Bookmark, Follow, Like, Repost
from app.models.interest import Interest, user_interests
from app.models.media import Media
from app.models.notification import Notification
from app.models.post import Draft, Post
from app.models.tag import Tag, post_tags
from app.models.token import PasswordResetToken, RefreshToken
from app.models.user import Profile, User, UserSettings
from app.models.verification import VerificationCode

__all__ = [
    "Ad",
    "Bookmark",
    "Comment",
    "Draft",
    "Follow",
    "Interest",
    "Like",
    "Media",
    "Notification",
    "PasswordResetToken",
    "Post",
    "Profile",
    "RefreshToken",
    "Repost",
    "Tag",
    "User",
    "UserSettings",
    "VerificationCode",
    "post_tags",
    "user_interests",
]
