"""Endpoints for the hosting platform, not for people or the app.

Vercel's scheduled job (vercel.json) calls the clean-up below once a day, sending
"Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET configured the endpoint does not exist.
"""

import hmac

from fastapi import APIRouter, Header

from app.core.config import settings
from app.core.deps import DbSession
from app.core.errors import NotFound, Unauthorized
from app.services.auth_service import purge_expired_tokens
from app.services.report_service import purge_resolved

router = APIRouter(prefix="/internal", include_in_schema=False)


@router.get("/cron/purge-tokens")
def purge_tokens(db: DbSession, authorization: str | None = Header(default=None)) -> dict:
    if not settings.cron_secret:
        raise NotFound("Not found", "not_found")
    expected = f"Bearer {settings.cron_secret}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise Unauthorized("Not allowed", "cron_unauthorized")
    sessions, resets = purge_expired_tokens(db)
    reports = purge_resolved(db)
    return {"sessions_deleted": sessions, "reset_links_deleted": resets, "reports_deleted": reports}
