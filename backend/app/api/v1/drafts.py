from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.common import Page
from app.schemas.post import DraftOut, DraftWrite
from app.services import post_service
from app.services.human_check import RequireHuman
from app.utils.pagination import PageParams, page_params

router = APIRouter(prefix="/drafts", tags=["Drafts"])
Pagination = Annotated[PageParams, Depends(page_params)]


@router.get("", response_model=Page[DraftOut], summary="Your drafts, most recently edited first")
def list_drafts(db: DbSession, user: CurrentUser, params: Pagination) -> Page[DraftOut]:
    return post_service.list_drafts(db, user, params)


@router.post(
    "",
    response_model=DraftOut,
    status_code=status.HTTP_201_CREATED,
    summary="Save a new draft",
    dependencies=[RequireHuman],
)
def create_draft(data: DraftWrite, db: DbSession, user: CurrentUser) -> DraftOut:
    return post_service.create_draft(db, user, data)


@router.get("/{draft_id}", response_model=DraftOut, summary="A draft")
def get_draft(draft_id: int, db: DbSession, user: CurrentUser) -> DraftOut:
    return post_service.get_draft(db, user, draft_id)


@router.put("/{draft_id}", response_model=DraftOut, summary="Update a draft", dependencies=[RequireHuman])
def update_draft(draft_id: int, data: DraftWrite, db: DbSession, user: CurrentUser) -> DraftOut:
    return post_service.update_draft(db, user, draft_id, data)


@router.delete(
    "/{draft_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Discard a draft", dependencies=[RequireHuman]
)
def delete_draft(draft_id: int, db: DbSession, user: CurrentUser) -> Response:
    post_service.delete_draft(db, user, draft_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
