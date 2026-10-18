from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status

from app.core.deps import CurrentUser, DbSession
from app.core.errors import Conflict, NotFound
from app.core.rate_limit import rate_limit
from app.models import Media
from app.schemas.misc import MediaOut
from app.services import media_service, presenters
from app.services.human_check import RequireHuman

router = APIRouter(prefix="/media", tags=["Media"])


@router.post(
    "",
    response_model=MediaOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an image to attach to a post",
    description="Accepts JPEG, PNG, WebP or GIF up to 5 MB. Images are validated and re-encoded to WebP.",
    dependencies=[RequireHuman, Depends(rate_limit("upload", limit=30, window=600))],
)
async def upload(
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
    kind: Literal["post_image"] = Form("post_image"),
) -> MediaOut:
    raw = await media_service.read_upload(file)
    media = media_service.store_image(db, user, raw, kind)
    db.commit()
    return presenters.media_out(media)


@router.delete(
    "/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unused upload",
    dependencies=[RequireHuman],
)
def delete(media_id: int, db: DbSession, user: CurrentUser) -> Response:
    media = db.get(Media, media_id)
    if media is None or media.owner_id != user.id:
        raise NotFound("Image not found", "media_not_found")
    if media_service.is_referenced(db, media.id):
        raise Conflict("This image is still used by a post or draft", "media_in_use")
    media_service.delete_media(db, media)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
