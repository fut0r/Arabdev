from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status

from app.core.deps import AdminUser, DbSession
from app.core.rate_limit import rate_limit
from app.schemas.misc import AdAdminOut, AdOut, AdWrite
from app.services import ad_service

router = APIRouter(prefix="/ads", tags=["Ads"])


@router.get(
    "",
    response_model=list[AdOut],
    # Serving an ad records an impression in the database, so this GET writes on every
    # call. The limit matches the public pages (240/min): a page load fetches at most a
    # couple of placements, so real readers — even many behind one shared address —
    # stay far below it, while a loop inflating impressions is stopped.
    dependencies=[Depends(rate_limit("ads", limit=240, window=60))],
    summary="Ads for a placement",
    description=(
        "Returns up to `limit` active ads for the placement and language. `offset` rotates which ads are "
        "returned, so passing the feed page number gives each page a predictable, different set."
    ),
)
def serve_ads(
    db: DbSession,
    placement: Literal["feed", "sidebar"] = "feed",
    lang: Literal["ar", "en"] | None = None,
    limit: Annotated[int, Query(ge=1, le=4)] = 2,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> list[AdOut]:
    return ad_service.serve(db, placement, lang, limit, offset)


@router.post(
    "/{ad_id}/click",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Record a click",
    dependencies=[Depends(rate_limit("ad_click", limit=60, window=60))],
)
def click(ad_id: int, db: DbSession) -> Response:
    ad_service.record_click(db, ad_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/manage", response_model=list[AdAdminOut], summary="All ads with stats (admin)")
def list_ads(db: DbSession, _admin: AdminUser) -> list[AdAdminOut]:
    return ad_service.list_all(db)


@router.post("/manage", response_model=AdAdminOut, status_code=status.HTTP_201_CREATED, summary="Create an ad (admin)")
def create_ad(data: AdWrite, db: DbSession, _admin: AdminUser) -> AdAdminOut:
    return ad_service.create(db, data)


@router.put("/manage/{ad_id}", response_model=AdAdminOut, summary="Replace an ad (admin)")
def update_ad(ad_id: int, data: AdWrite, db: DbSession, _admin: AdminUser) -> AdAdminOut:
    return ad_service.update_ad(db, ad_id, data)


@router.delete("/manage/{ad_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an ad (admin)")
def delete_ad(ad_id: int, db: DbSession, _admin: AdminUser) -> Response:
    ad_service.delete(db, ad_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
