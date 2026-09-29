from fastapi import APIRouter
from sqlalchemy import text

from app.api.v1 import ads, auth, discovery, drafts, internal, media, moderation, notifications, posts, users
from app.core.config import settings
from app.core.deps import DbSession
from app.core.redis_client import get_redis

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(posts.router)
api_router.include_router(posts.interactions)
api_router.include_router(posts.comments)
api_router.include_router(moderation.reports)
api_router.include_router(drafts.router)
api_router.include_router(discovery.search_router)
api_router.include_router(discovery.tags_router)
api_router.include_router(discovery.interests_router)
api_router.include_router(notifications.router)
api_router.include_router(media.router)
api_router.include_router(ads.router)
api_router.include_router(moderation.admin)
api_router.include_router(internal.router)


@api_router.get("/health", tags=["Health"], summary="Liveness and dependency status")
def health(db: DbSession) -> dict:
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "unavailable"
    if not settings.redis_url:
        redis_status = "disabled"
    else:
        redis_status = "ok" if get_redis() is not None else "unavailable"
    return {"status": "ok" if database == "ok" else "degraded", "database": database, "redis": redis_status}
