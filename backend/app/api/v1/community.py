from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.core.rate_limit import rate_limit
from app.schemas.common import Page
from app.schemas.community import (
    AcceptedAnswerWrite,
    BookmarkWrite,
    CollectionOut,
    CollectionWrite,
    FeaturedWrite,
    SeriesOut,
    SeriesWrite,
    TopicState,
)
from app.schemas.post import PostKind, PostOut, TagStat
from app.schemas.user import UserCard
from app.services import community_service as service
from app.services.human_check import RequireHuman
from app.utils.pagination import PageParams, page_params

router = APIRouter(tags=["Community"])
Pagination = Annotated[PageParams, Depends(page_params)]
WRITE = [RequireHuman, Depends(rate_limit("community_write", limit=120, window=3600))]


@router.get("/browse", response_model=Page[PostOut])
def browse(
    db: DbSession,
    viewer: OptionalUser,
    params: Pagination,
    sort: Literal["latest", "trending", "featured"] = "latest",
    days: Annotated[int, Query(ge=0, le=365)] = 0,
    kind: PostKind | None = None,
    language: Literal["ar", "en", "mul"] | None = None,
    unanswered: bool = False,
    series_id: Annotated[int | None, Query(gt=0)] = None,
):
    return service.browse(
        db,
        viewer,
        params,
        sort=sort,
        days=days,
        kind=kind,
        language=language,
        unanswered=unanswered,
        series_id=series_id,
    )


@router.get("/developers", response_model=Page[UserCard])
def developers(
    db: DbSession,
    viewer: OptionalUser,
    params: Pagination,
    q: Annotated[str, Query(max_length=100)] = "",
    interest: Annotated[str | None, Query(max_length=40)] = None,
):
    return service.developers(db, viewer, params, q, interest)


@router.get("/library/collections", response_model=list[CollectionOut])
def collections(db: DbSession, user: CurrentUser):
    return service.collections(db, user)


@router.post("/library/collections", response_model=CollectionOut, status_code=201, dependencies=WRITE)
def create_collection(data: CollectionWrite, db: DbSession, user: CurrentUser):
    return service.save_collection(db, user, data.name)


@router.put("/library/collections/{collection_id}", response_model=CollectionOut, dependencies=WRITE)
def rename_collection(collection_id: int, data: CollectionWrite, db: DbSession, user: CurrentUser):
    return service.save_collection(db, user, data.name, collection_id)


@router.delete("/library/collections/{collection_id}", status_code=204, dependencies=WRITE)
def delete_collection(collection_id: int, db: DbSession, user: CurrentUser):
    service.remove_collection(db, user, collection_id)
    return Response(status_code=204)


@router.put("/library/bookmarks/{post_id}", response_model=PostOut, dependencies=WRITE)
def save_bookmark(post_id: int, data: BookmarkWrite, db: DbSession, user: CurrentUser):
    return service.save_bookmark(db, user, post_id, data)


@router.get("/series/mine", response_model=list[SeriesOut])
def own_series(db: DbSession, user: CurrentUser):
    return service.own_series(db, user)


@router.get("/series/{series_id}", response_model=SeriesOut)
def series(series_id: int, db: DbSession):
    return service.get_series(db, series_id)


@router.post("/series", response_model=SeriesOut, status_code=201, dependencies=WRITE)
def create_series(data: SeriesWrite, db: DbSession, user: CurrentUser):
    return service.save_series(db, user, data)


@router.put("/series/{series_id}", response_model=SeriesOut, dependencies=WRITE)
def update_series(series_id: int, data: SeriesWrite, db: DbSession, user: CurrentUser):
    return service.save_series(db, user, data, series_id)


@router.delete("/series/{series_id}", status_code=204, dependencies=WRITE)
def delete_series(series_id: int, db: DbSession, user: CurrentUser):
    service.remove_series(db, user, series_id)
    return Response(status_code=204)


@router.put("/posts/{post_id}/answer", response_model=PostOut, dependencies=WRITE)
def accept_answer(post_id: int, data: AcceptedAnswerWrite, db: DbSession, user: CurrentUser):
    return service.accept_answer(db, user, post_id, data.comment_id)


@router.put("/posts/{post_id}/featured", response_model=PostOut, dependencies=WRITE)
def feature_post(post_id: int, data: FeaturedWrite, db: DbSession, user: CurrentUser):
    return service.feature_post(db, user, post_id, data.featured)


@router.get("/topics/following", response_model=list[TagStat])
def followed_tags(db: DbSession, user: CurrentUser):
    return service.followed_tags(db, user)


@router.put("/topics/{slug}/follow", response_model=TopicState, dependencies=WRITE)
def follow_tag(slug: str, data: TopicState, db: DbSession, user: CurrentUser):
    service.follow_tag(db, user, slug, data.following)
    return data
