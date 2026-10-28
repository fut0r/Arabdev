"""GitHub OAuth with browser-bound state and PKCE. Never link accounts by email."""

import base64
import hashlib
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

import jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BadRequest, Conflict, NotFound, ServiceUnavailable, Unauthorized
from app.core.security import hash_password
from app.models import GitHubIdentity, User
from app.repositories import users as users_repo
from app.services import spam_guard
from app.utils.time import utcnow

COOKIE = "arabdev_github"


def enabled() -> None:
    if not settings.github_configured:
        raise NotFound("GitHub sign-in is not configured", "not_found")


def start(user_id: int | None, language: str) -> tuple[str, str]:
    enabled()
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    cookie = jwt.encode(
        {
            "purpose": "github_oauth",
            "state": state,
            "verifier": verifier,
            "user_id": user_id,
            "language": language,
            "exp": utcnow() + timedelta(minutes=10),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    query = urllib.parse.urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.frontend_url.rstrip("/") + "/auth/github/callback",
            "scope": "read:user user:email",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    return "https://github.com/login/oauth/authorize?" + query, cookie


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _request(url: str, *, data: dict | None = None, token: str | None = None):
    headers = {"Accept": "application/json", "User-Agent": "ArabDev/1.4"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = urllib.parse.urlencode(data).encode() if data else None
    request = urllib.request.Request(url, data=body, headers=headers)  # noqa: S310 - fixed GitHub HTTPS URLs
    try:
        opener = urllib.request.build_opener(_NoRedirect())
        with opener.open(request, timeout=10) as response:
            return json.loads(response.read(1_000_000))
    except (urllib.error.URLError, ValueError, TimeoutError):
        raise ServiceUnavailable("GitHub is unavailable. Please try again.", "github_unavailable") from None


def complete(db: Session, cookie: str | None, state: str, code: str, viewer: User | None) -> tuple[User, bool]:
    enabled()
    try:
        pending = jwt.decode(cookie or "", settings.secret_key, algorithms=[settings.jwt_algorithm])
        if pending.get("purpose") != "github_oauth" or not secrets.compare_digest(pending["state"], state):
            raise ValueError
        linking = pending.get("user_id")
        if linking and (viewer is None or viewer.id != linking):
            raise ValueError
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise BadRequest("GitHub sign-in expired or changed. Start again.", "github_state_invalid") from None
    result = _request(
        "https://github.com/login/oauth/access_token",
        data={
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "code": code,
            "code_verifier": pending["verifier"],
            "redirect_uri": settings.frontend_url.rstrip("/") + "/auth/github/callback",
        },
    )
    token = result.get("access_token")
    if not token:
        raise BadRequest("GitHub authorization was not completed", "github_denied")
    profile = _request("https://api.github.com/user", token=token)
    github_id = str(profile.get("id", ""))
    if not github_id.isdigit() or len(github_id) > 32:
        raise BadRequest("GitHub identity was not valid", "github_denied")
    identity = db.get(GitHubIdentity, github_id)
    if identity:
        if linking and identity.user_id != linking:
            raise Conflict("This GitHub account is already linked", "github_already_linked")
        user = db.get(User, identity.user_id)
    elif linking:
        user = viewer
        db.add(GitHubIdentity(github_id=github_id, user_id=user.id))
    else:
        emails = _request("https://api.github.com/user/emails", token=token)
        verified = [entry for entry in emails if entry.get("verified") and entry.get("email")]
        verified.sort(key=lambda entry: not entry.get("primary"))
        if not verified:
            raise BadRequest("Verify an email address on GitHub first", "github_email_required")
        email = verified[0]["email"].lower()
        if users_repo.email_taken(db, email):
            raise Conflict("Sign in with your existing account and link GitHub in Settings", "github_link_existing")
        spam_guard.ensure_real_inbox(email)
        # Avoid reserving popular/reserved usernames or matching configured admin handles.
        username = "gh" + secrets.token_hex(8)
        while users_repo.username_taken(db, username) or username in settings.admin_usernames:
            username = "gh" + secrets.token_hex(8)
        user = users_repo.create_user(
            db,
            username=username,
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(48)),
            language=pending.get("language", "ar"),
        )
        user.profile.display_name = str(profile.get("name") or profile.get("login") or username)[:80]
        user.email_verified_at = utcnow()
        db.add(GitHubIdentity(github_id=github_id, user_id=user.id))
    if not user or not user.is_active:
        raise Unauthorized("This account is unavailable", "account_inactive")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("This account already has a GitHub identity", "github_already_linked") from None
    return user, bool(linking)
