from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response, status

from app.core.config import settings
from app.core.deps import DbSession, require_client_header
from app.core.rate_limit import client_ip, rate_limit
from app.schemas.auth import (
    AuthResultOut,
    AvailabilityOut,
    ForgotPasswordIn,
    LoginIn,
    PublicConfigOut,
    RegisterIn,
    ResetPasswordIn,
    TokenOut,
)
from app.schemas.common import MessageOut
from app.schemas.verification import ChallengeIn, ChallengeOut, VerifyCodeIn
from app.services import auth_service, presenters, turnstile_service, verification_service
from app.services.auth_service import IssuedTokens

router = APIRouter(prefix="/auth", tags=["Authentication"])

RefreshCookie = Annotated[str | None, Cookie(alias=settings.refresh_cookie_name, include_in_schema=False)]


def _cookie_path() -> str:
    return f"{settings.api_v1_prefix}/auth"


def token_response(db, response: Response, issued: IssuedTokens) -> TokenOut:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=issued.refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path=_cookie_path(),
        # Without "remember me" the cookie lives only for the browser session.
        max_age=settings.refresh_token_expire_days * 86400 if issued.remember else None,
    )
    response.headers["Cache-Control"] = "no-store"
    return TokenOut(
        access_token=issued.access_token, expires_in=issued.expires_in, user=presenters.me_out(db, issued.user)
    )


def challenge_out(challenge: verification_service.Challenge) -> ChallengeOut:
    return ChallengeOut(
        challenge_id=challenge.challenge_id,
        email=challenge.email,
        purpose=challenge.purpose,
        expires_in=challenge.expires_in,
        resend_in=challenge.resend_in,
    )


@router.get(
    "/config",
    response_model=PublicConfigOut,
    summary="Public settings the sign-in screens need",
    description="The Turnstile site key (safe to publish) and whether emailed codes are in use.",
)
def public_config() -> PublicConfigOut:
    return PublicConfigOut(
        turnstile_site_key=settings.turnstile_site_key if settings.turnstile_configured else None,
        email_codes=settings.email_codes_required,
    )


@router.post(
    "/register",
    response_model=AuthResultOut,
    summary="Create an account",
    description=(
        "Sends a six-digit code to the address and returns a challenge; the account is created only "
        "once that code is confirmed at /auth/verify. With email codes switched off, the account is "
        "created immediately and tokens are returned."
    ),
    dependencies=[
        Depends(rate_limit("register", limit=10, window=3600)),
        Depends(turnstile_service.guard("register")),
    ],
)
def register(data: RegisterIn, db: DbSession, request: Request, response: Response) -> AuthResultOut:
    if settings.email_codes_required:
        challenge = auth_service.start_registration(db, data, language=data.language, ip=client_ip(request))
        return AuthResultOut(status="verification_required", challenge=challenge_out(challenge))
    user = auth_service.register(db, data, language=data.language)
    issued = auth_service.issue_tokens(db, user, remember=True, user_agent=request.headers.get("user-agent"))
    return AuthResultOut(status="authenticated", tokens=token_response(db, response, issued))


@router.post(
    "/login",
    response_model=AuthResultOut,
    summary="Sign in with email and password",
    description="Returns a challenge when the account asks for an emailed code, and tokens otherwise.",
    dependencies=[
        Depends(rate_limit("login", limit=10, window=60)),
        Depends(turnstile_service.guard("login")),
    ],
)
def login(data: LoginIn, db: DbSession, request: Request, response: Response) -> AuthResultOut:
    user = auth_service.authenticate(db, data.email, data.password)
    if auth_service.login_needs_code(db, user):
        challenge = auth_service.start_login(db, user, remember=data.remember_me, ip=client_ip(request))
        return AuthResultOut(status="verification_required", challenge=challenge_out(challenge))
    issued = auth_service.issue_tokens(
        db, user, remember=data.remember_me, user_agent=request.headers.get("user-agent")
    )
    auth_service.notify_security(db, user, "new_sign_in", detail=_device_line(request))
    return AuthResultOut(status="authenticated", tokens=token_response(db, response, issued))


def _device_line(request: Request) -> str:
    agent = (request.headers.get("user-agent") or "").strip()
    return f"{client_ip(request)} · {agent[:120]}" if agent else client_ip(request)


@router.post(
    "/verify",
    response_model=TokenOut,
    summary="Finish signing in or signing up with the emailed code",
    dependencies=[Depends(rate_limit("verify", limit=20, window=300))],
)
def verify(data: VerifyCodeIn, db: DbSession, request: Request, response: Response) -> TokenOut:
    purpose = verification_service.purpose_of(db, data.challenge_id)
    if purpose == "register":
        user = auth_service.complete_registration(db, data.challenge_id, data.code)
        remember = True
    else:
        user, remember = auth_service.complete_login(db, data.challenge_id, data.code)
    issued = auth_service.issue_tokens(db, user, remember=remember, user_agent=request.headers.get("user-agent"))
    if purpose == "login":
        auth_service.notify_security(db, user, "new_sign_in", detail=_device_line(request))
    return token_response(db, response, issued)


@router.post(
    "/resend",
    response_model=ChallengeOut,
    summary="Send the code again",
    dependencies=[Depends(rate_limit("resend", limit=10, window=900))],
)
def resend(data: ChallengeIn, db: DbSession, request: Request) -> ChallengeOut:
    return challenge_out(verification_service.resend(db, data.challenge_id, ip=client_ip(request)))


@router.post(
    "/refresh",
    response_model=TokenOut,
    summary="Exchange the refresh cookie for a new access token",
    dependencies=[Depends(require_client_header), Depends(rate_limit("refresh", limit=60, window=60))],
)
def refresh(db: DbSession, request: Request, response: Response, refresh_token: RefreshCookie = None) -> TokenOut:
    issued = auth_service.rotate_refresh_token(db, refresh_token, request.headers.get("user-agent"))
    return token_response(db, response, issued)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign out of this browser",
    dependencies=[Depends(require_client_header)],
)
def logout(db: DbSession, refresh_token: RefreshCookie = None) -> Response:
    auth_service.revoke_refresh_token(db, refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(settings.refresh_cookie_name, path=_cookie_path())
    return response


@router.get(
    "/availability",
    response_model=AvailabilityOut,
    summary="Check whether a username or email can be used",
    dependencies=[Depends(rate_limit("availability", limit=60, window=60))],
)
def availability(
    db: DbSession,
    username: Annotated[str | None, Query(max_length=40)] = None,
    email: Annotated[str | None, Query(max_length=254)] = None,
) -> AvailabilityOut:
    return auth_service.check_availability(db, username, email)


@router.post(
    "/forgot-password",
    response_model=MessageOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Email a password reset link",
    dependencies=[
        Depends(rate_limit("forgot", limit=5, window=900)),
        Depends(turnstile_service.guard("forgot_password")),
    ],
)
def forgot_password(data: ForgotPasswordIn, db: DbSession) -> MessageOut:
    auth_service.request_password_reset(db, data.email)
    return MessageOut(detail="If an account exists for this email, a reset link is on its way.")


@router.post(
    "/reset-password",
    response_model=MessageOut,
    summary="Choose a new password using a reset link",
    dependencies=[Depends(rate_limit("reset", limit=10, window=900))],
)
def reset_password(data: ResetPasswordIn, db: DbSession) -> MessageOut:
    auth_service.reset_password(db, data.token, data.password)
    return MessageOut(detail="Your password has been changed. You can sign in now.")
