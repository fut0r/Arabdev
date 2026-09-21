from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.core.rate_limit import rate_limit
from app.schemas.comment import CommentCreate, CommentOut
from app.schemas.common import Page
from app.schemas.post import PostCounters, PostCreate, PostOut, PostUpdate
from app.services import comment_service, interaction_service, post_service, turnstile_service
from app.services.post_service import FeedTab
from app.utils.pagination import PageParams, page_params

router = APIRouter(prefix="/posts", tags=["Posts"])
interactions = APIRouter(prefix="/posts", tags=["Interactions"])
comments = APIRouter(tags=["Comments"])

Pagination = Annotated[PageParams, Depends(page_params)]


@router.get(
    "",
    response_model=Page[PostOut],
    summary="Home feed (20 posts per page, paginated on the server)",
    description=(
        "tab=for_you ranks recent posts from people you follow and on your interests first; "
        "tab=following shows posts and reposts from people you follow; tab=latest is everything, newest first. "
        "Pass tag=<slug> to list a tag's posts instead. Anonymous visitors always get latest."
    ),
)
def list_posts(
    db: DbSession,
    viewer: OptionalUser,
    params: Pagination,
    tab: FeedTab = "for_you",
    tag: Annotated[str | None, Query(max_length=40)] = None,
) -> Page[PostOut]:
    return post_service.feed(db, viewer, tab, params, tag=tag.lower() if tag else None)


@router.get("/trending", response_model=Page[PostOut], summary="Most discussed posts of the week")
def trending(
    db: DbSession, viewer: OptionalUser, params: Pagination, days: Annotated[int, Query(ge=1, le=90)] = 7
) -> Page[PostOut]:
    return post_service.trending(db, viewer, params, days)


@router.get("/{post_id}", response_model=PostOut, summary="A single post")
def get_post(post_id: int, db: DbSession, viewer: OptionalUser) -> PostOut:
    return post_service.get_post(db, post_id, viewer)


@router.post(
    "",
    response_model=PostOut,
    status_code=status.HTTP_201_CREATED,
    summary="Publish a post",
    dependencies=[
        Depends(rate_limit("post_create", limit=30, window=3600)),
        Depends(turnstile_service.guard("publish_post")),
    ],
)
def create_post(data: PostCreate, db: DbSession, user: CurrentUser) -> PostOut:
    return post_service.create_post(db, user, data)


@router.put("/{post_id}", response_model=PostOut, summary="Edit your post")
def update_post(post_id: int, data: PostUpdate, db: DbSession, user: CurrentUser) -> PostOut:
    return post_service.update_post(db, user, post_id, data)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete your post")
def delete_post(post_id: int, db: DbSession, user: CurrentUser) -> Response:
    post_service.delete_post(db, user, post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------ interactions

_interaction_limit = [Depends(rate_limit("interaction", limit=300, window=3600))]


@interactions.post("/{post_id}/like", response_model=PostCounters, dependencies=_interaction_limit)
def like(post_id: int, db: DbSession, user: CurrentUser) -> PostCounters:
    return interaction_service.like(db, user, post_id)


@interactions.delete("/{post_id}/like", response_model=PostCounters)
def unlike(post_id: int, db: DbSession, user: CurrentUser) -> PostCounters:
    return interaction_service.unlike(db, user, post_id)


@interactions.post("/{post_id}/bookmark", response_model=PostCounters, dependencies=_interaction_limit)
def bookmark(post_id: int, db: DbSession, user: CurrentUser) -> PostCounters:
    return interaction_service.bookmark(db, user, post_id)


@interactions.delete("/{post_id}/bookmark", response_model=PostCounters)
def unbookmark(post_id: int, db: DbSession, user: CurrentUser) -> PostCounters:
    return interaction_service.unbookmark(db, user, post_id)


@interactions.post("/{post_id}/repost", response_model=PostCounters, dependencies=_interaction_limit)
def repost(post_id: int, db: DbSession, user: CurrentUser) -> PostCounters:
    return interaction_service.repost(db, user, post_id)


@interactions.delete("/{post_id}/repost", response_model=PostCounters)
def unrepost(post_id: int, db: DbSession, user: CurrentUser) -> PostCounters:
    return interaction_service.unrepost(db, user, post_id)


# ------------------------------------------------------------ comments


@comments.get("/posts/{post_id}/comments", response_model=Page[CommentOut], summary="Comments on a post, oldest first")
def list_comments(post_id: int, db: DbSession, viewer: OptionalUser, params: Pagination) -> Page[CommentOut]:
    return comment_service.list_for_post(db, post_id, viewer, params)


@comments.post(
    "/posts/{post_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Comment on a post",
    dependencies=[
        Depends(rate_limit("comment", limit=60, window=600)),
        Depends(turnstile_service.guard("comment")),
    ],
)
def create_comment(post_id: int, data: CommentCreate, db: DbSession, user: CurrentUser) -> CommentOut:
    return comment_service.create(db, user, post_id, data)


@comments.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment (its author or the post's author)",
)
def delete_comment(comment_id: int, db: DbSession, user: CurrentUser) -> Response:
    comment_service.delete(db, user, comment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
