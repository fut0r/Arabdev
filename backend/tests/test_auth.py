from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.models import PasswordResetToken, RefreshToken
from app.services import email_service
from app.services.auth_service import purge_expired_tokens
from app.utils.time import utcnow
from tests.conftest import API, PASSWORD


def register_payload(**overrides):
    payload = {
        "username": "omar_dev",
        "email": "omar@example.com",
        "password": PASSWORD,
        "password_confirm": PASSWORD,
    }
    payload.update(overrides)
    return payload


def test_register_signs_in_and_sets_refresh_cookie(client):
    response = client.post(f"{API}/auth/register", json=register_payload(username="Omar_Dev"))
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "authenticated"  # no mail provider in tests, so no code step
    tokens = body["tokens"]
    assert tokens["access_token"]
    assert tokens["user"]["username"] == "omar_dev"  # usernames are case-insensitive
    assert tokens["user"]["onboarding_completed"] is False
    assert tokens["user"]["settings"]["language"] == "ar"
    assert settings.refresh_cookie_name in response.cookies
    assert "hashed_password" not in tokens["user"]


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"username": "1abc"}, "username", "username_invalid"),
        ({"username": "ab"}, "username", "username_invalid"),
        ({"username": "admin"}, "username", "username_reserved"),
        ({"email": "not-an-email"}, "email", "value_error"),
        ({"password": "short1", "password_confirm": "short1"}, "password", "password_too_short"),
        ({"password": "onlyletters", "password_confirm": "onlyletters"}, "password", "password_too_weak"),
        ({"password_confirm": "Different2026"}, "password_confirm", "passwords_mismatch"),
    ],
)
def test_register_validation(client, overrides, field, code):
    response = client.post(f"{API}/auth/register", json=register_payload(**overrides))
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert {"field": field, "code": code} in [{"field": e["field"], "code": e["code"]} for e in body["errors"]]


def test_duplicate_username_and_email(client, make_user):
    make_user("omar_dev", "omar@example.com")
    taken_name = client.post(f"{API}/auth/register", json=register_payload(email="other@example.com"))
    assert taken_name.status_code == 409
    assert taken_name.json() == {"detail": "Username is already taken", "code": "username_taken", "field": "username"}

    taken_email = client.post(f"{API}/auth/register", json=register_payload(username="someone", email="OMAR@example.com"))
    assert taken_email.status_code == 409
    assert taken_email.json()["code"] == "email_taken"


def test_availability(client, make_user):
    make_user("taken_name", "taken@example.com")
    body = client.get(f"{API}/auth/availability", params={"username": "taken_name", "email": "free@example.com"}).json()
    assert body["username"] == {"available": False, "code": "username_taken", "detail": "Username is already taken"}
    assert body["email"]["available"] is True
    invalid = client.get(f"{API}/auth/availability", params={"username": "9lives"}).json()
    assert invalid["username"]["code"] == "username_invalid"


def test_login(client, make_user):
    make_user("layla", "layla@example.com")
    wrong = client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": "Nope12345"})
    assert wrong.status_code == 401
    assert wrong.json()["code"] == "invalid_credentials"

    unknown = client.post(f"{API}/auth/login", json={"email": "ghost@example.com", "password": PASSWORD})
    assert unknown.json()["code"] == "invalid_credentials"  # same answer: no account enumeration

    ok = client.post(f"{API}/auth/login", json={"email": "LAYLA@example.com", "password": PASSWORD, "remember_me": True})
    assert ok.status_code == 200
    tokens = ok.json()["tokens"]
    me = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.json()["username"] == "layla"


def test_protected_routes_require_a_valid_token(client):
    assert client.get(f"{API}/users/me").json()["code"] == "not_authenticated"
    bad = client.get(f"{API}/users/me", headers={"Authorization": "Bearer nonsense"})
    assert bad.status_code == 401
    assert bad.json()["code"] == "token_invalid"


def test_refresh_rotates_and_detects_reuse(client, make_user, monkeypatch):
    monkeypatch.setattr(settings, "refresh_reuse_grace_seconds", 0)
    make_user("layla")
    first_cookie = client.cookies.get(settings.refresh_cookie_name)

    refreshed = client.post(f"{API}/auth/refresh")
    assert refreshed.status_code == 200
    second_cookie = client.cookies.get(settings.refresh_cookie_name)
    assert second_cookie and second_cookie != first_cookie

    # Replaying the old token revokes the whole session family, including the new token.
    client.cookies.set(settings.refresh_cookie_name, first_cookie, path=f"{API}/auth")
    assert client.post(f"{API}/auth/refresh").status_code == 401
    client.cookies.set(settings.refresh_cookie_name, second_cookie, path=f"{API}/auth")
    assert client.post(f"{API}/auth/refresh").status_code == 401


def test_concurrent_refresh_from_two_tabs_is_not_treated_as_theft(client, make_user):
    make_user("layla")
    shared_cookie = client.cookies.get(settings.refresh_cookie_name)
    assert client.post(f"{API}/auth/refresh").status_code == 200  # tab 1
    client.cookies.set(settings.refresh_cookie_name, shared_cookie, path=f"{API}/auth")
    assert client.post(f"{API}/auth/refresh").status_code == 200  # tab 2, same old cookie, moments later


def test_refresh_requires_client_header(client, make_user):
    make_user("layla")
    response = client.post(f"{API}/auth/refresh", headers={"X-ArabDev-Client": ""})
    assert response.status_code == 403
    assert response.json()["code"] == "client_header_required"


def test_logout_revokes_refresh_token(client, make_user):
    make_user("layla")
    cookie = client.cookies.get(settings.refresh_cookie_name)
    assert client.post(f"{API}/auth/logout").status_code == 204
    client.cookies.set(settings.refresh_cookie_name, cookie, path=f"{API}/auth")
    assert client.post(f"{API}/auth/refresh").status_code == 401


def test_purge_deletes_only_sessions_and_reset_links_that_ended_long_ago(client, make_user, db):
    make_user("layla", "layla@example.com")
    assert client.post(f"{API}/auth/logout").status_code == 204
    client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": PASSWORD})
    client.post(f"{API}/auth/forgot-password", json={"email": "layla@example.com"})
    assert purge_expired_tokens(db) == (0, 0)  # the logout is recent: still kept for reuse detection

    long_ago = utcnow() - timedelta(days=8)
    db.execute(update(RefreshToken).where(RefreshToken.revoked_at.is_not(None)).values(revoked_at=long_ago))
    db.execute(update(PasswordResetToken).values(expires_at=long_ago))
    db.commit()
    assert purge_expired_tokens(db) == (1, 1)
    remaining = db.scalars(select(RefreshToken)).all()
    assert len(remaining) == 1 and remaining[0].revoked_at is None
    assert client.post(f"{API}/auth/refresh").status_code == 200


def test_password_reset_flow(client, make_user):
    make_user("layla", "layla@example.com")
    email_service.outbox.clear()

    response = client.post(f"{API}/auth/forgot-password", json={"email": "layla@example.com"})
    assert response.status_code == 202
    unknown = client.post(f"{API}/auth/forgot-password", json={"email": "ghost@example.com"})
    assert unknown.json() == response.json()
    assert len(email_service.outbox) == 1

    token = email_service.outbox[0].body.split("token=")[1].split()[0]
    new_password = "Moonlight2027"
    reset = client.post(
        f"{API}/auth/reset-password",
        json={"token": token, "password": new_password, "password_confirm": new_password},
    )
    assert reset.status_code == 200
    reused = client.post(
        f"{API}/auth/reset-password",
        json={"token": token, "password": new_password, "password_confirm": new_password},
    )
    assert reused.json()["code"] == "reset_token_invalid"

    login = client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": new_password})
    assert login.status_code == 200


def test_change_password_invalidates_existing_access_tokens(client, make_user):
    account = make_user("layla")
    wrong = client.post(
        f"{API}/users/me/password",
        json={"current_password": "Wrong1234", "new_password": "Moonlight2027", "new_password_confirm": "Moonlight2027"},
        headers=account.headers,
    )
    assert wrong.json()["code"] == "current_password_invalid"

    changed = client.post(
        f"{API}/users/me/password",
        json={"current_password": PASSWORD, "new_password": "Moonlight2027", "new_password_confirm": "Moonlight2027"},
        headers=account.headers,
    )
    assert changed.status_code == 200
    assert changed.json()["status"] == "updated"
    assert client.get(f"{API}/users/me", headers=account.headers).status_code == 401
    new_headers = {"Authorization": f"Bearer {changed.json()['tokens']['access_token']}"}
    assert client.get(f"{API}/users/me", headers=new_headers).status_code == 200
