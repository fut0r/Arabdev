"""Emailed six-digit codes, Turnstile, signed-in devices and the data export."""

import re

import pytest

from app.core.config import settings
from app.services import email_service, turnstile_service
from tests.conftest import API, PASSWORD

CODE = re.compile(r"\b(\d{6})\b")


@pytest.fixture
def codes_on(monkeypatch):
    """Switch on emailed codes, as production does once SMTP is configured."""

    def enable() -> None:
        monkeypatch.setattr(settings, "email_codes_enabled", True)
        email_service.outbox.clear()

    return enable


def last_code(to: str | None = None) -> str:
    for message in reversed(email_service.outbox):
        if to and message.to != to:
            continue
        found = CODE.search(message.subject)
        if found:
            return found.group(1)
    raise AssertionError(f"no code was emailed to {to or 'anyone'}: {[m.subject for m in email_service.outbox]}")


def register_payload(username="omar_dev", email="omar@example.com"):
    return {"username": username, "email": email, "password": PASSWORD, "password_confirm": PASSWORD}


# ------------------------------------------------------------------ signing up


def test_registration_waits_for_the_emailed_code(client, codes_on):
    codes_on()
    response = client.post(f"{API}/auth/register", json=register_payload())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "verification_required"
    assert body["tokens"] is None
    challenge = body["challenge"]
    assert challenge["purpose"] == "register"
    assert challenge["email"] == "o**r@example.com"  # partly hidden
    assert challenge["expires_in"] > 0

    # Nothing exists yet: the name is still free and the password cannot sign anyone in.
    assert client.get(f"{API}/auth/availability", params={"username": "omar_dev"}).json()["username"]["available"]
    assert client.post(f"{API}/auth/login", json={"email": "omar@example.com", "password": PASSWORD}).status_code == 401

    code = last_code("omar@example.com")
    assert code not in str(body)  # the code itself never travels over the API

    verified = client.post(f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": code})
    assert verified.status_code == 200
    assert verified.json()["user"]["username"] == "omar_dev"
    assert verified.json()["user"]["email_verified"] is True
    assert settings.refresh_cookie_name in verified.cookies


def test_a_code_works_once(client, codes_on):
    codes_on()
    challenge = client.post(f"{API}/auth/register", json=register_payload()).json()["challenge"]
    code = last_code()
    first = client.post(f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": code})
    assert first.status_code == 200
    replayed = client.post(f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": code})
    assert replayed.status_code == 422
    assert replayed.json()["code"] == "code_used"


def test_wrong_codes_are_limited(client, codes_on, monkeypatch):
    codes_on()
    monkeypatch.setattr(settings, "verification_max_attempts", 3)
    challenge = client.post(f"{API}/auth/register", json=register_payload()).json()["challenge"]
    body = {"challenge_id": challenge["challenge_id"], "code": "000000"}
    codes = [client.post(f"{API}/auth/verify", json=body).json()["code"] for _ in range(3)]
    assert codes == ["code_invalid", "code_invalid", "code_attempts_exhausted"]
    # Even the right code is refused now: the challenge is spent.
    spent = client.post(f"{API}/auth/verify", json={**body, "code": last_code()})
    assert spent.json()["code"] in {"code_used", "code_attempts_exhausted"}


# ------------------------------------------------------------------ signing in


def test_sign_in_asks_for_a_code(client, make_user, codes_on):
    make_user("layla", "layla@example.com")
    codes_on()
    response = client.post(
        f"{API}/auth/login", json={"email": "layla@example.com", "password": PASSWORD, "remember_me": True}
    )
    assert response.status_code == 200
    challenge = response.json()["challenge"]
    assert challenge["purpose"] == "login"

    wrong = client.post(f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": "123123"})
    assert wrong.status_code == 422

    verified = client.post(
        f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": last_code("layla@example.com")}
    )
    assert verified.status_code == 200
    me = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {verified.json()['access_token']}"})
    assert me.json()["username"] == "layla"


def test_a_code_is_skipped_when_the_account_asks_to_skip_it(client, make_user, codes_on):
    account = make_user("layla", "layla@example.com")
    client.patch(f"{API}/users/me/settings", json={"login_code_required": False}, headers=account.headers)
    codes_on()
    response = client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": PASSWORD})
    assert response.json()["status"] == "authenticated"


def test_resending_has_a_cooldown(client, make_user, codes_on, monkeypatch):
    make_user("layla", "layla@example.com")
    codes_on()
    challenge = client.post(
        f"{API}/auth/login", json={"email": "layla@example.com", "password": PASSWORD}
    ).json()["challenge"]
    too_soon = client.post(f"{API}/auth/resend", json={"challenge_id": challenge["challenge_id"]})
    assert too_soon.status_code == 429
    assert too_soon.json()["code"] == "code_resend_too_soon"

    monkeypatch.setattr(settings, "verification_resend_seconds", 0)
    first_code = last_code("layla@example.com")
    again = client.post(f"{API}/auth/resend", json={"challenge_id": challenge["challenge_id"]})
    assert again.status_code == 200
    assert last_code("layla@example.com") != first_code  # a new code, and only it works
    stale = client.post(f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": first_code})
    assert stale.status_code == 422


# ------------------------------------------------------------------ account changes


def test_changing_the_password_needs_a_code(client, make_user, codes_on):
    account = make_user("layla", "layla@example.com")
    codes_on()
    new_password = "Moonlight2027"
    started = client.post(
        f"{API}/users/me/password",
        json={"current_password": PASSWORD, "new_password": new_password, "new_password_confirm": new_password},
        headers=account.headers,
    )
    assert started.json()["status"] == "verification_required"
    # The old password still works until the code is entered.
    assert client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": new_password}).status_code == 401

    challenge = started.json()["challenge"]
    confirmed = client.post(
        f"{API}/users/me/password/verify",
        json={"challenge_id": challenge["challenge_id"], "code": last_code("layla@example.com")},
        headers=account.headers,
    )
    assert confirmed.status_code == 200
    assert client.get(f"{API}/users/me", headers=account.headers).status_code == 401  # other sessions ended
    assert any("password" in message.subject.lower() or "كلمة" in message.subject for message in email_service.outbox)


def test_changing_the_email_needs_a_code_sent_to_the_new_address(client, make_user, codes_on):
    account = make_user("layla", "layla@example.com")
    codes_on()
    started = client.post(
        f"{API}/users/me/email",
        json={"email": "Layla.New@Example.com", "current_password": PASSWORD},
        headers=account.headers,
    )
    assert started.json()["status"] == "verification_required"
    assert email_service.outbox[-1].to == "layla.new@example.com"
    assert client.get(f"{API}/users/me", headers=account.headers).json()["email"] == "layla@example.com"

    confirmed = client.post(
        f"{API}/users/me/email/verify",
        json={
            "challenge_id": started.json()["challenge"]["challenge_id"],
            "code": last_code("layla.new@example.com"),
        },
        headers=account.headers,
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["email"] == "layla.new@example.com"
    # The address that lost the account is told, whatever the alert setting says.
    assert email_service.outbox[-1].to == "layla@example.com"


def test_one_persons_code_cannot_be_used_by_another(client, make_user, codes_on):
    victim = make_user("layla", "layla@example.com")
    attacker = make_user("mallory", "mallory@example.com")
    codes_on()
    started = client.post(
        f"{API}/users/me/email",
        json={"email": "layla.new@example.com", "current_password": PASSWORD},
        headers=victim.headers,
    )
    stolen = {
        "challenge_id": started.json()["challenge"]["challenge_id"],
        "code": last_code("layla.new@example.com"),
    }
    response = client.post(f"{API}/users/me/email/verify", json=stolen, headers=attacker.headers)
    assert response.status_code == 422
    assert response.json()["code"] == "code_challenge_invalid"


# ------------------------------------------------------------------ Turnstile


def test_turnstile_blocks_requests_without_a_token(client, make_user, monkeypatch):
    account = make_user("layla", "layla@example.com")
    monkeypatch.setattr(settings, "turnstile_site_key", "0xTEST")
    monkeypatch.setattr(settings, "turnstile_secret_key", "0xSECRET")
    calls: list[dict] = []

    def fake_siteverify(token, *, remote_ip=None):
        calls.append({"token": token, "ip": remote_ip})
        return {"success": token == "good-token", "error-codes": [] if token == "good-token" else ["invalid-input-response"]}

    monkeypatch.setattr(turnstile_service, "siteverify", fake_siteverify)

    missing = client.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert missing.status_code == 422
    assert missing.json()["code"] == "turnstile_missing"
    assert calls == []  # a missing token never reaches Cloudflare

    bad = client.post(
        f"{API}/auth/login",
        json={"email": "nobody@example.com", "password": PASSWORD},
        headers={"X-Turnstile-Token": "forged"},
    )
    assert bad.json()["code"] == "turnstile_expired"

    published = client.post(
        f"{API}/posts",
        json={"content_html": "<p>Guarded</p>"},
        headers={**account.headers, "X-Turnstile-Token": "good-token"},
    )
    assert published.status_code == 201
    assert calls[-1]["token"] == "good-token"


def test_turnstile_is_skipped_when_it_is_not_configured(client, make_user):
    assert settings.turnstile_configured is False
    account = make_user("layla")
    assert client.post(f"{API}/posts", json={"content_html": "<p>Fine</p>"}, headers=account.headers).status_code == 201


# ------------------------------------------------------------------ devices and data


def test_sessions_can_be_listed_and_ended(client, make_user):
    account = make_user("layla", "layla@example.com")
    client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": PASSWORD})  # a second browser

    sessions = client.get(f"{API}/users/me/sessions", headers=account.headers).json()
    assert len(sessions) == 2
    assert sum(1 for session in sessions if session["current"]) == 1

    other = next(session for session in sessions if not session["current"])
    assert client.delete(f"{API}/users/me/sessions/{other['id']}", headers=account.headers).status_code == 204
    remaining = client.get(f"{API}/users/me/sessions", headers=account.headers).json()
    assert [session["current"] for session in remaining] == [True]
    # This browser is untouched and can still reach the account.
    assert client.get(f"{API}/users/me", headers=account.headers).status_code == 200


def test_sessions_belong_to_their_owner(client, make_user):
    account = make_user("layla", "layla@example.com")
    session_id = client.get(f"{API}/users/me/sessions", headers=account.headers).json()[0]["id"]
    intruder = make_user("mallory", "mallory@example.com")
    assert client.delete(f"{API}/users/me/sessions/{session_id}", headers=intruder.headers).status_code == 404


def test_account_export_contains_the_users_own_work(client, make_user, make_post):
    account = make_user("layla", "layla@example.com")
    make_post(account, "<p>Exported post</p>")
    response = client.get(f"{API}/users/me/export", headers=account.headers)
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    data = response.json()
    assert data["account"]["email"] == "layla@example.com"
    assert data["posts"][0]["content_html"] == "<p>Exported post</p>"
    assert "hashed_password" not in str(data)


def test_config_endpoint_publishes_only_the_site_key(client, monkeypatch):
    monkeypatch.setattr(settings, "turnstile_site_key", "0xSITE")
    monkeypatch.setattr(settings, "turnstile_secret_key", "0xSECRET")
    body = client.get(f"{API}/auth/config").json()
    assert body == {"turnstile_site_key": "0xSITE", "email_codes": settings.email_codes_required}


# ------------------------------------------------------------------ search engines


def test_sitemap_lists_posts_and_findable_profiles(client, make_user, make_post):
    account = make_user("layla", "layla@example.com")
    post = make_post(account, "<p>Indexed</p>", tags=["python"])
    hidden = make_user("ghost", "ghost@example.com")
    client.patch(f"{API}/users/me/settings", json={"discoverable": False}, headers=hidden.headers)

    response = client.get("/sitemap.xml")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/xml")
    body = response.text
    assert f"/posts/{post['id']}</loc>" in body
    assert "/u/layla</loc>" in body
    assert "/tags/python</loc>" in body
    assert "/u/ghost</loc>" not in body  # opted out of being findable
