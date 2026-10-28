from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.common import ORMModel
from app.schemas.user import UserSummary

CollectionName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
SeriesTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class CollectionWrite(BaseModel):
    name: CollectionName


class CollectionOut(ORMModel):
    id: int
    name: str
    posts_count: int = 0


class BookmarkWrite(BaseModel):
    collection_id: int | None = Field(default=None, gt=0)
    note: str | None = Field(default=None, max_length=1000)


class SeriesWrite(BaseModel):
    title: SeriesTitle
    description: str | None = Field(default=None, max_length=500)


class SeriesOut(BaseModel):
    id: int
    title: str
    description: str | None
    author: UserSummary
    posts_count: int
    created_at: datetime


class AcceptedAnswerWrite(BaseModel):
    comment_id: int | None = Field(default=None, gt=0)


class FeaturedWrite(BaseModel):
    featured: bool


class TopicState(BaseModel):
    following: bool
