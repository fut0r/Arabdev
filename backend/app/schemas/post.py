from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.user import UserSummary
from app.utils.validators import clean_optional_text, normalize_http_url

MAX_TAGS = 5
MAX_CONTENT_HTML = 200_000
PostKind = Literal["article", "question", "project", "note"]
ContentLanguage = Literal["auto", "ar", "en", "mul"]


class ContentMetadata(BaseModel):
    kind: PostKind = "article"
    language: ContentLanguage = "auto"
    repository_url: str | None = None
    demo_url: str | None = None
    series_id: int | None = Field(default=None, gt=0)
    series_order: int = Field(default=1, ge=1, le=999)

    @field_validator("repository_url", "demo_url")
    @classmethod
    def _project_url(cls, value: str | None) -> str | None:
        return normalize_http_url(value, max_length=500)


class TagOut(BaseModel):
    slug: str
    name: str


class TagStat(TagOut):
    posts_count: int = 0


class ImageOut(BaseModel):
    id: int
    url: str
    width: int
    height: int


class PostOut(ContentMetadata):
    excerpt: str = ""
    featured: bool = False
    accepted_comment_id: int | None = None
    series_title: str | None = None
    bookmark_collection_id: int | None = None
    bookmark_note: str | None = None
    id: int
    title: str | None
    content_html: str
    link_url: str | None
    image: ImageOut | None
    tags: list[TagOut]
    author: UserSummary
    created_at: datetime
    updated_at: datetime
    edited_at: datetime | None
    likes_count: int
    comments_count: int
    reposts_count: int
    reading_minutes: int
    liked: bool = False
    bookmarked: bool = False
    reposted: bool = False
    # Set when the post appears in a feed because someone the viewer follows reposted it.
    reposted_by: UserSummary | None = None
    # Hidden from everyone else while the moderators review reports; only its author and the
    # moderators can still open it.
    under_review: bool = False


class PostRef(BaseModel):
    id: int
    title: str | None
    excerpt: str
    author_username: str


class _PostFields(ContentMetadata):
    title: str | None = Field(default=None, max_length=200)
    content_html: str = Field(default="", max_length=MAX_CONTENT_HTML)
    link_url: str | None = None
    image_media_id: int | None = None
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)

    _title = field_validator("title")(clean_optional_text)

    @field_validator("link_url")
    @classmethod
    def _link(cls, value: str | None) -> str | None:
        return normalize_http_url(value, max_length=500)

    @field_validator("tags")
    @classmethod
    def _tags(cls, value: list[str]) -> list[str]:
        cleaned = []
        for tag in value:
            tag = tag.strip().lstrip("#").strip()
            if tag and len(tag) <= 30 and tag.lower() not in {t.lower() for t in cleaned}:
                cleaned.append(tag)
        return cleaned


class PostCreate(_PostFields):
    # When publishing from a draft, the draft is removed once the post is created.
    draft_id: int | None = None
    expected_revision: int | None = Field(default=None, ge=1)


class PostUpdate(_PostFields):
    pass


class DraftWrite(_PostFields):
    expected_revision: int | None = Field(default=None, ge=1)


class DraftOut(ContentMetadata):
    revision: int = 1
    id: int
    title: str | None
    content_html: str
    link_url: str | None
    image: ImageOut | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class PostCounters(BaseModel):
    post_id: int
    liked: bool
    bookmarked: bool
    reposted: bool
    likes_count: int
    comments_count: int
    reposts_count: int
