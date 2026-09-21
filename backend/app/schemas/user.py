from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import ORMModel
from app.schemas.verification import ChallengeOut
from app.utils.validators import (
    clean_optional_text,
    normalize_http_url,
    normalize_username,
    validate_password_strength,
)

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class InterestOut(ORMModel):
    id: int
    slug: str
    name_en: str
    name_ar: str


class UserSummary(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str | None = None


class UserCard(UserSummary):
    bio: str | None = None
    interests: list[InterestOut] = []
    followers_count: int = 0
    is_following: bool = False
    follows_you: bool = False


class ProfileOut(UserCard):
    location: str | None = None
    website: str | None = None
    created_at: datetime
    following_count: int = 0
    posts_count: int = 0
    is_me: bool = False
    follow_lists_visible: bool = True


Feed = Literal["for_you", "following", "latest"]


class SettingsOut(ORMModel):
    theme: Literal["light", "dark", "system"]
    language: Literal["ar", "en"]
    default_feed: Feed
    reduce_motion: bool
    discoverable: bool
    show_follow_lists: bool
    mentions_from: Literal["everyone", "following", "none"]
    login_code_required: bool
    email_security_alerts: bool
    email_product_updates: bool
    notify_likes: bool
    notify_comments: bool
    notify_follows: bool
    notify_reposts: bool
    notify_mentions: bool


class SettingsUpdate(BaseModel):
    theme: Literal["light", "dark", "system"] | None = None
    language: Literal["ar", "en"] | None = None
    default_feed: Feed | None = None
    reduce_motion: bool | None = None
    discoverable: bool | None = None
    show_follow_lists: bool | None = None
    mentions_from: Literal["everyone", "following", "none"] | None = None
    login_code_required: bool | None = None
    email_security_alerts: bool | None = None
    email_product_updates: bool | None = None
    notify_likes: bool | None = None
    notify_comments: bool | None = None
    notify_follows: bool | None = None
    notify_reposts: bool | None = None
    notify_mentions: bool | None = None


class MeOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: str
    bio: str | None = None
    location: str | None = None
    website: str | None = None
    avatar_url: str | None = None
    interests: list[InterestOut] = []
    onboarding_completed: bool
    email_verified: bool = False
    is_admin: bool
    created_at: datetime
    followers_count: int = 0
    following_count: int = 0
    settings: SettingsOut


class ProfileUpdate(BaseModel):
    display_name: DisplayName
    bio: str | None = Field(default=None, max_length=280)
    location: str | None = Field(default=None, max_length=60)
    website: str | None = None

    _clean_bio = field_validator("bio", "location")(clean_optional_text)

    @field_validator("website")
    @classmethod
    def _website(cls, value: str | None) -> str | None:
        return normalize_http_url(value, max_length=200, add_scheme=True)


class UsernameUpdate(BaseModel):
    username: str

    _username = field_validator("username")(normalize_username)


class EmailUpdate(BaseModel):
    email: EmailStr
    current_password: str = Field(max_length=128)

    @field_validator("email")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.lower()


class PasswordUpdate(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str
    new_password_confirm: str

    _strength = field_validator("new_password")(validate_password_strength)

    @field_validator("new_password_confirm")
    @classmethod
    def _matches(cls, value: str, info) -> str:
        if value != info.data.get("new_password"):
            raise PydanticCustomError("passwords_mismatch", "Passwords do not match")
        return value


class EmailChangeOut(BaseModel):
    """Either the address changed, or a code went to the new one first."""

    status: Literal["updated", "verification_required"]
    user: MeOut | None = None
    challenge: ChallengeOut | None = None


class SessionOut(BaseModel):
    """One signed-in browser, listed under Settings so strangers can be thrown out."""

    id: int
    user_agent: str | None = None
    created_at: datetime
    expires_at: datetime
    remember: bool
    current: bool


class InterestsUpdate(BaseModel):
    interest_ids: list[int] = Field(default_factory=list, max_length=25)


class AccountDelete(BaseModel):
    password: str = Field(max_length=128)


class FollowState(BaseModel):
    user_id: int
    following: bool
    followers_count: int
