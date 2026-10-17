"""Two-step sign-in with an authenticator app, refusing breached passwords, and blocking."""

import hashlib

import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.models import RecoveryCode, User
from app.services import email_service, password_check, two_factor_service
from tests.conftest import API, PASSWORD


def app_code(secret: str, offset: int = 0) -> str:
    """What an authenticator app would show right now (or `offset` steps from now)."""
    return two_factor_service._code_at(secret, two_factor_service._current_step() + offset)


def turn_on_two_factor(client, account) -> tuple[str, list[str]]:
    setup = client.post(f"{API}/users/me/two-factor/setup", json={"password": PASSWORD}, headers=account.headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    enabled = client.post(f"{API}/users/me/two-factor/enable", json={"code": app_code(secret)}, headers=account.headers)
    assert enabled.status_code == 200, enabled.text
    return secret, enabled.json()["recovery_codes"]


def sign_in(client, email: str, password: str = PASSWORD) -> dict:
    response = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------- two-step sign-in


def test_setting_up_an_authenticator_app(client, make_user, db):
    account = make_user("layla")
    wrong_password = client.post(
        f"{API}/users/me/two-factor/setup", json={"password": "Nope12345"}, headers=account.headers
    )
    assert wrong_password.json()["code"] == "current_password_invalid"

    setup = client.post(f"{API}/users/me/two-factor/setup", json={"password": PASSWORD}, headers=account.headers).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/ArabDev%3Alayla?secret=")
    assert setup["qr_code"].startswith("data:image/svg+xml;base64,")
    # Stored encrypted, never as the plain secret.
    stored = db.scalar(select(User.totp_secret).where(User.id == account.id))
    assert stored and setup["secret"] not in stored

    # Not on until a first correct code proves the app has the secret.
    assert client.get(f"{API}/users/me", headers=account.headers).json()["two_factor_enabled"] is False
    bad = client.post(f"{API}/users/me/two-factor/enable", json={"code": "000000"}, headers=account.headers)
    assert bad.json()["code"] == "two_factor_code_invalid"

    email_service.outbox.clear()
    codes = client.post(
        f"{API}/users/me/two-factor/enable", json={"code": app_code(setup["secret"])}, headers=account.headers
    ).json()["recovery_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    assert all(len(code) == 11 and code[5] == "-" for code in codes)
    me = client.get(f"{API}/users/me", headers=account.headers).json()
    assert me["two_factor_enabled"] is True and me["recovery_codes_left"] == 10
    assert any("Two-step sign-in is on" in m.subject or "التحقق بخطوتين" in m.subject for m in email_service.outbox)
    # Only hashes are kept.
    hashes = set(db.scalars(select(RecoveryCode.code_hash).where(RecoveryCode.user_id == account.id)))
    assert codes[0] not in hashes and len(hashes) == 10


def test_signing_in_asks_for_the_app_code_instead_of_an_email(client, make_user):
    account = make_user("layla")
    secret, _ = turn_on_two_factor(client, account)
    email_service.outbox.clear()

    started = sign_in(client, account.email)
    assert started["status"] == "verification_required"
    challenge = started["challenge"]
    assert challenge["purpose"] == "login_2fa"
    assert email_service.outbox == []  # nothing is emailed for an app code
    resend = client.post(f"{API}/auth/resend", json={"challenge_id": challenge["challenge_id"]})
    assert resend.json()["code"] == "code_resend_unavailable"

    wrong = client.post(f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": "123456"})
    assert wrong.json()["code"] == "code_invalid"
    # The next 30-second step's code is accepted too, for clocks that run a little fast.
    ok = client.post(
        f"{API}/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": app_code(secret, 1)}
    )
    assert ok.status_code == 200 and ok.json()["access_token"]


def test_an_app_code_works_only_once(client, make_user):
    account = make_user("layla")
    secret, _ = turn_on_two_factor(client, account)
    code = app_code(secret, 1)

    first = sign_in(client, account.email)["challenge"]["challenge_id"]
    assert client.post(f"{API}/auth/verify", json={"challenge_id": first, "code": code}).status_code == 200
    second = sign_in(client, account.email)["challenge"]["challenge_id"]
    replay = client.post(f"{API}/auth/verify", json={"challenge_id": second, "code": code})
    assert replay.json()["code"] == "code_invalid"


def test_recovery_codes_sign_in_once_each(client, make_user):
    account = make_user("layla")
    _, codes = turn_on_two_factor(client, account)
    email_service.outbox.clear()

    challenge = sign_in(client, account.email)["challenge"]["challenge_id"]
    used = client.post(f"{API}/auth/verify", json={"challenge_id": challenge, "code": codes[0].upper()})
    assert used.status_code == 200
    alerts = [m for m in email_service.outbox if "استرداد" in m.subject or "recovery" in m.subject.lower()]
    assert len(alerts) == 1 and "9" in alerts[0].body  # it says how many are left

    again = sign_in(client, account.email)["challenge"]["challenge_id"]
    reused = client.post(f"{API}/auth/verify", json={"challenge_id": again, "code": codes[0]})
    assert reused.json()["code"] == "code_invalid"
    token = used.json()["access_token"]
    assert (
        client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"}).json()["recovery_codes_left"] == 9
    )


def test_wrong_codes_run_out(client, make_user):
    account = make_user("layla")
    turn_on_two_factor(client, account)
    challenge = sign_in(client, account.email)["challenge"]["challenge_id"]
    for _ in range(settings.verification_max_attempts - 1):
        assert (
            client.post(f"{API}/auth/verify", json={"challenge_id": challenge, "code": "000000"}).json()["code"]
            == "code_invalid"
        )
    last = client.post(f"{API}/auth/verify", json={"challenge_id": challenge, "code": "000000"})
    assert last.json()["code"] == "code_attempts_exhausted"


def test_turning_it_off_and_new_recovery_codes(client, make_user):
    account = make_user("layla")
    secret, codes = turn_on_two_factor(client, account)

    fresh = client.post(
        f"{API}/users/me/two-factor/recovery-codes", json={"password": PASSWORD}, headers=account.headers
    )
    new_codes = fresh.json()["recovery_codes"]
    assert set(new_codes).isdisjoint(codes)

    no_code = client.post(
        f"{API}/users/me/two-factor/disable", json={"password": PASSWORD, "code": codes[0]}, headers=account.headers
    )
    assert no_code.json()["code"] == "two_factor_code_invalid"  # old recovery codes are gone
    off = client.post(
        f"{API}/users/me/two-factor/disable", json={"password": PASSWORD, "code": new_codes[0]}, headers=account.headers
    )
    assert off.status_code == 204
    assert client.get(f"{API}/users/me", headers=account.headers).json()["two_factor_enabled"] is False
    assert sign_in(client, account.email)["status"] == "authenticated"
    assert secret  # the old secret no longer matters


# ---------------------------------------------------------------- breached passwords


@pytest.fixture
def breaches(monkeypatch):
    """Pretend the Pwned Passwords range API knows one leaked password."""
    leaked = "Password123"
    monkeypatch.setattr(settings, "pwned_passwords_enabled", True)
    calls = []

    def fake_count(password: str):
        calls.append(hashlib.sha1(password.encode(), usedforsecurity=False).hexdigest()[:5])
        return 51_000 if password == leaked else 0

    monkeypatch.setattr(password_check, "breach_count", fake_count)
    return leaked, calls


def test_breached_passwords_are_refused(client, make_user, breaches):
    leaked, calls = breaches
    refused = client.post(
        f"{API}/auth/register",
        json={"username": "omar", "email": "omar@example.com", "password": leaked, "password_confirm": leaked},
    )
    assert refused.status_code == 422
    assert refused.json()["code"] == "password_breached" and refused.json()["field"] == "password"

    account = make_user("layla")
    change = client.post(
        f"{API}/users/me/password",
        json={"current_password": PASSWORD, "new_password": leaked, "new_password_confirm": leaked},
        headers=account.headers,
    )
    assert change.json()["code"] == "password_breached" and change.json()["field"] == "new_password"
    assert calls  # the check ran


def test_only_a_hash_prefix_leaves_the_server(monkeypatch):
    seen = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            suffix = hashlib.sha1(b"hunter2", usedforsecurity=False).hexdigest().upper()[5:]
            return f"0000000000000000000000000000000000A:0\r\n{suffix}:17\r\n".encode()

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["padding"] = request.get_header("Add-padding")
        return FakeResponse()

    monkeypatch.setattr(password_check.urllib.request, "urlopen", fake_urlopen)
    assert password_check.breach_count("hunter2") == 17
    prefix = hashlib.sha1(b"hunter2", usedforsecurity=False).hexdigest().upper()[:5]
    assert seen["url"] == password_check.RANGE_URL + prefix and seen["padding"] == "true"
    assert "hunter2" not in seen["url"]


def test_an_unreachable_service_does_not_block_anyone(monkeypatch):
    def broken(*_args, **_kwargs):
        raise OSError("network down")

    monkeypatch.setattr(password_check.urllib.request, "urlopen", broken)
    monkeypatch.setattr(settings, "pwned_passwords_enabled", True)
    assert password_check.breach_count("anything") is None
    password_check.ensure_not_breached("anything")  # does not raise


# ---------------------------------------------------------------- blocking


def test_blocking_separates_two_accounts(client, make_user, make_post, db):
    layla = make_user("layla")
    omar = make_user("omar")
    client.post(f"{API}/users/{omar.id}/follow", headers=layla.headers)
    client.post(f"{API}/users/{layla.id}/follow", headers=omar.headers)
    layla_post = make_post(layla, title="Layla's post")
    omar_post = make_post(omar, title="Omar's post")

    assert client.post(f"{API}/users/{layla.id}/block", headers=layla.headers).json()["code"] == "cannot_block_self"
    assert client.post(f"{API}/users/{omar.id}/block", headers=layla.headers).status_code == 204

    # Follows are gone both ways, and cannot come back from either side.
    assert client.get(f"{API}/users/layla", headers=omar.headers).json()["followers_count"] == 0
    assert client.post(f"{API}/users/{layla.id}/follow", headers=omar.headers).json()["code"] == "blocked"
    assert client.post(f"{API}/users/{omar.id}/follow", headers=layla.headers).json()["code"] == "blocked"

    # No comments or reposts across the block, in either direction.
    comment = client.post(f"{API}/posts/{layla_post['id']}/comments", json={"content": "hi"}, headers=omar.headers)
    assert comment.json()["code"] == "blocked"
    assert client.post(f"{API}/posts/{layla_post['id']}/repost", headers=omar.headers).json()["code"] == "blocked"
    assert client.post(f"{API}/posts/{omar_post['id']}/repost", headers=layla.headers).json()["code"] == "blocked"

    # Mentions and likes do not notify across it.
    make_post(omar, content="<p>hello @layla</p>")
    client.post(f"{API}/posts/{layla_post['id']}/like", headers=omar.headers)
    assert client.get(f"{API}/notifications/unread-count", headers=layla.headers).json() == {"count": 0}

    # Layla stops seeing Omar's posts; signed-out visitors still see everything.
    titles = [
        p["title"] for p in client.get(f"{API}/posts", params={"tab": "latest"}, headers=layla.headers).json()["items"]
    ]
    assert "Omar's post" not in titles and "Layla's post" in titles
    public = [p["title"] for p in client.get(f"{API}/posts", params={"tab": "latest"}).json()["items"]]
    assert "Omar's post" in public
    for_you = [
        p["title"] for p in client.get(f"{API}/posts", params={"tab": "for_you"}, headers=layla.headers).json()["items"]
    ]
    assert "Omar's post" not in for_you
    search = client.get(f"{API}/search", params={"q": "post"}, headers=layla.headers).json()
    assert all(p["author"]["username"] != "omar" for p in search["posts"]["items"])
    assert client.get(f"{API}/users/omar/posts", headers=layla.headers).json()["total"] == 0

    profile = client.get(f"{API}/users/omar", headers=layla.headers).json()
    assert profile["blocked"] is True
    # Omar is not told; the flag is only ever set for the blocker.
    assert client.get(f"{API}/users/layla", headers=omar.headers).json()["blocked"] is False

    blocked = client.get(f"{API}/users/me/blocked", headers=layla.headers).json()
    assert [user["username"] for user in blocked["items"]] == ["omar"]
    assert client.get(f"{API}/users/me/export", headers=layla.headers).json()["blocked"] == ["omar"]

    assert client.delete(f"{API}/users/{omar.id}/block", headers=layla.headers).status_code == 204
    assert client.post(f"{API}/users/{omar.id}/follow", headers=layla.headers).status_code == 200


def test_blocked_comments_are_hidden_from_the_blocker(client, make_user, make_post):
    layla = make_user("layla")
    omar = make_user("omar")
    sara = make_user("sara")
    post = make_post(sara, title="Sara's post")
    client.post(f"{API}/posts/{post['id']}/comments", json={"content": "from omar"}, headers=omar.headers)
    client.post(f"{API}/posts/{post['id']}/comments", json={"content": "from layla"}, headers=layla.headers)
    client.post(f"{API}/users/{omar.id}/block", headers=layla.headers)

    seen = [
        c["content"] for c in client.get(f"{API}/posts/{post['id']}/comments", headers=layla.headers).json()["items"]
    ]
    assert seen == ["from layla"]
    everyone = client.get(f"{API}/posts/{post['id']}/comments").json()["items"]
    assert len(everyone) == 2


def test_blocked_accounts_are_never_suggested(client, make_user, db):
    layla = make_user("layla")
    omar = make_user("omar")
    db.execute(update(User).where(User.id == omar.id).values(onboarding_completed=True))
    db.commit()
    before = [u["username"] for u in client.get(f"{API}/users/recommended", headers=layla.headers).json()]
    assert "omar" in before
    client.post(f"{API}/users/{layla.id}/block", headers=omar.headers)  # omar blocks layla
    after = [u["username"] for u in client.get(f"{API}/users/recommended", headers=layla.headers).json()]
    assert "omar" not in after
