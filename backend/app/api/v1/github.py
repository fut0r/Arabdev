from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from app.api.v1.auth import challenge_out, token_response
from app.core.config import settings
from app.core.deps import DbSession, OptionalUser, require_client_header
from app.core.errors import Unauthorized
from app.core.rate_limit import client_ip, rate_limit
from app.core.security import verify_password
from app.schemas.auth import AuthResultOut
from app.services import auth_service, github_service, two_factor_service

router = APIRouter(
    prefix="/auth/github",
    tags=["Authentication"],
    dependencies=[Depends(require_client_header), Depends(rate_limit("github", limit=15, window=300))],
)


class Start(BaseModel):
    link: bool = False
    password: str | None = Field(default=None, max_length=200)
    language: Literal["ar", "en"] = "ar"


class Complete(BaseModel):
    code: str = Field(min_length=1, max_length=500)
    state: str = Field(min_length=20, max_length=200)


@router.post("/start")
def start(data: Start, viewer: OptionalUser, response: Response):
    if data.link and (not viewer or not data.password or not verify_password(data.password, viewer.hashed_password)):
        raise Unauthorized("Confirm your password to link GitHub", "credentials_invalid")
    url, cookie = github_service.start(viewer.id if data.link else None, data.language)
    response.set_cookie(
        github_service.COOKIE,
        cookie,
        max_age=600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=f"{settings.api_v1_prefix}/auth/github",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"url": url}


@router.post("/complete", response_model=AuthResultOut)
def complete(data: Complete, db: DbSession, viewer: OptionalUser, request: Request, response: Response):
    user, linked = github_service.complete(
        db, request.cookies.get(github_service.COOKIE), data.state, data.code, viewer
    )
    response.delete_cookie(github_service.COOKIE, path=f"{settings.api_v1_prefix}/auth/github")
    if two_factor_service.is_enabled(user):
        challenge = auth_service.start_two_factor_login(db, user, remember=True, ip=client_ip(request))
        return AuthResultOut(status="verification_required", challenge=challenge_out(challenge))
    if auth_service.login_needs_code(db, user):
        challenge = auth_service.start_login(db, user, remember=True, ip=client_ip(request))
        return AuthResultOut(status="verification_required", challenge=challenge_out(challenge))
    issued = auth_service.issue_tokens(db, user, remember=True, user_agent=request.headers.get("user-agent"))
    auth_service.notify_security(db, user, "new_sign_in", detail="GitHub linked" if linked else "GitHub")
    return AuthResultOut(status="authenticated", tokens=token_response(db, response, issued))
