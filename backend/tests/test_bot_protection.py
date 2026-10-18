"""Bot and spam protection: the human pass, the sign-up trap, throwaway inboxes, limits for new
accounts, duplicate text, response headers, and SQL injection attempts."""

from datetime import timedelta
from urllib.parse import quote

import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.models import Post, User
from app.services import human_check, turnstile_service
from app.utils.time import utcnow
from tests.conftest import API, PASSWORD


@pytest.fixture
def turnstile_on(monkeypatch):
    """Call after creating accounts: Turnstile configured, with Cloudflare answering yes to "good-token"."""

    def switch_on() -> None:
        _configure(monkeypatch)

    return switch_on


def _configure(monkeypatch) -> None:
    monkeypatch.setattr(settings, "turnstile_site_key", "0xSITE")
    monkeypatch.setattr(settings, "turnstile_secret_key", "0xSECRET")
    monkeypatch.setattr(
        turnstile_service, "siteverify", lambda token, *, remote_ip=None: {"success": token == "good-token"}
    )


def human_pass(client, account) -> str:
    response = client.post(
        f"{API}/users/me/human-check", headers={**account.headers, "X-Turnstile-Token": "good-token"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["expires_in"] == 1800
    return response.json()["token"]


def age(db, account, days: int) -> None:
    db.execute(update(User).where(User.id == account.id).values(created_at=utcnow() - timedelta(days=days)))
    db.commit()


# ------------------------------------------------------------ the human pass


def test_writes_need_a_human_pass_when_turnstile_is_on(client, make_user, make_post, turnstile_on):
    author = make_user("layla")
    reader = make_user("omar")
    turnstile_on()
    post = client.post(
        f"{API}/posts",
        json={"content_html": "<p>Needs a fresh token, as before</p>"},
        headers={**author.headers, "X-Turnstile-Token": "good-token"},
    ).json()

    refused = client.post(f"{API}/posts/{post['id']}/like", headers=reader.headers)
    assert refused.status_code == 403
    assert refused.json()["code"] == "human_check_required"
    assert client.post(f"{API}/users/{author.id}/follow", headers=reader.headers).status_code == 403

    token = human_pass(client, reader)
    with_pass = {**reader.headers, human_check.HEADER: token}
    assert client.post(f"{API}/posts/{post['id']}/like", headers=with_pass).status_code == 200
    assert client.post(f"{API}/users/{author.id}/follow", headers=with_pass).status_code == 200

    # Bound to one account: the reader's pass does nothing for the author.
    other = client.post(f"{API}/posts/{post['id']}/bookmark", headers={**author.headers, human_check.HEADER: token})
    assert other.json()["code"] == "human_check_required"


def test_the_pass_needs_a_solved_check_and_is_never_a_login(client, make_user, turnstile_on, db):
    reader = make_user("omar")
    turnstile_on()
    forged = client.post(f"{API}/users/me/human-check", headers={**reader.headers, "X-Turnstile-Token": "forged"})
    assert forged.status_code == 422

    token = human_pass(client, reader)
    as_login = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})
    assert as_login.status_code == 401

    # Signing out everywhere (or a new password) moves token_version and voids every pass.
    db.execute(update(User).where(User.id == reader.id).values(token_version=User.token_version + 1))
    db.commit()
    assert human_check.is_valid(token, db.get(User, reader.id)) is False


def test_without_turnstile_keys_nothing_is_asked(client, make_user, make_post):
    author = make_user("layla")
    post = make_post(author)
    assert client.post(f"{API}/posts/{post['id']}/like", headers=make_user("omar").headers).status_code == 200


# ------------------------------------------------------------ sign-up


def register(client, username: str, email: str, **extra):
    return client.post(
        f"{API}/auth/register",
        json={"username": username, "email": email, "password": PASSWORD, "password_confirm": PASSWORD, **extra},
    )


def test_the_hidden_signup_field_turns_bots_away(client):
    bot = register(client, "spam_bot", "bot@example.com", homepage="https://cheap-pills.example")
    assert bot.status_code == 422
    assert bot.json()["code"] == "request_rejected"
    assert register(client, "real_person", "real@example.com", homepage="").status_code == 200


@pytest.mark.parametrize("email", ["x@mailinator.com", "x@inbox.yopmail.com", "X@Guerrillamail.COM"])
def test_throwaway_inboxes_are_refused(client, email):
    response = register(client, "throwaway", email)
    assert response.status_code == 422
    assert response.json()["code"] == "email_disposable"


# ------------------------------------------------------------ new accounts, links and duplicates


LINKS = '<p><a href="https://a.example">a</a> <a href="https://b.example">b</a> and https://c.example</p>'


def test_new_accounts_get_two_links_for_their_first_day(client, make_user, db):
    newcomer = make_user("layla")
    too_many = client.post(f"{API}/posts", json={"content_html": LINKS}, headers=newcomer.headers)
    assert too_many.status_code == 422
    assert too_many.json()["code"] == "too_many_links"

    bio = client.patch(
        f"{API}/users/me/profile",
        json={"display_name": "Layla", "bio": "https://a.example https://b.example https://c.example"},
        headers=newcomer.headers,
    )
    assert bio.json()["code"] == "too_many_links"

    age(db, newcomer, days=2)
    assert client.post(f"{API}/posts", json={"content_html": LINKS}, headers=newcomer.headers).status_code == 201


@pytest.mark.parametrize(
    "url", ["https://files.example/setup.exe", "http://203.0.113.9/login", "https://x.example/app.apk?v=2"]
)
def test_new_accounts_cannot_link_to_programs_or_bare_ips(client, make_user, db, url):
    newcomer = make_user("layla")
    risky = client.post(f"{API}/posts", json={"content_html": f"<p>Get it: {url}</p>"}, headers=newcomer.headers)
    assert risky.json()["code"] == "risky_link"
    age(db, newcomer, days=2)
    later = client.post(f"{API}/posts", json={"content_html": f"<p>Get it: {url}</p>"}, headers=newcomer.headers)
    assert later.status_code == 201


def test_a_link_to_a_page_about_a_program_is_fine(client, make_user):
    newcomer = make_user("layla")
    content = {"content_html": "<p>See https://github.com/user/tool/releases</p>"}
    page = client.post(f"{API}/posts", json=content, headers=newcomer.headers)
    assert page.status_code == 201


def test_new_accounts_post_at_most_five_times_an_hour(client, make_user, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    newcomer = make_user("layla")
    for number in range(5):
        response = client.post(f"{API}/posts", json={"content_html": f"<p>Post {number}</p>"}, headers=newcomer.headers)
        assert response.status_code == 201
    sixth = client.post(f"{API}/posts", json={"content_html": "<p>Post 6</p>"}, headers=newcomer.headers)
    assert sixth.status_code == 429


def test_the_same_text_twice_is_refused(client, make_user, make_post):
    author = make_user("layla")
    reader = make_user("omar")
    post = make_post(author, content="<p>Buy followers now</p>")
    again = client.post(f"{API}/posts", json={"content_html": "<p>Buy followers now</p>"}, headers=author.headers)
    assert again.json()["code"] == "duplicate_post"

    comment = {"content": "Visit my profile for free followers and likes"}
    assert client.post(f"{API}/posts/{post['id']}/comments", json=comment, headers=reader.headers).status_code == 201
    repeat = client.post(f"{API}/posts/{post['id']}/comments", json=comment, headers=reader.headers)
    assert repeat.json()["code"] == "duplicate_comment"

    # Short replies may repeat.
    for _ in range(2):
        thanks = client.post(f"{API}/posts/{post['id']}/comments", json={"content": "Thanks!"}, headers=reader.headers)
        assert thanks.status_code == 201


# ------------------------------------------------------------ headers and SQL injection


def test_api_responses_cannot_be_rendered_as_pages(client):
    response = client.get(f"{API}/health")
    assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'; sandbox"
    assert response.headers["x-content-type-options"] == "nosniff"


INJECTIONS = ["' OR '1'='1", "'; DROP TABLE users; --", '" OR 1=1 --', "%' UNION SELECT password FROM users --", "%"]


@pytest.mark.parametrize("payload", INJECTIONS)
def test_sql_injection_is_only_ever_text(client, make_user, make_post, db, payload):
    make_post(make_user("layla"), content="<p>Something about Python</p>")

    found = client.get(f"{API}/search", params={"q": payload, "type": "posts"})
    assert found.status_code == 200
    assert found.json()["posts"]["items"] == []  # matched literally, so nothing

    login = client.post(f"{API}/auth/login", json={"email": f"{payload}@example.com", "password": payload})
    assert login.status_code in (401, 422)
    assert client.get(f"{API}/users/{quote(payload, safe='')}").status_code in (404, 422)
    assert client.get(f"/tags/{quote(payload, safe='')}/rss.xml").status_code == 404

    # Every table is still there and untouched.
    assert db.scalar(select(User.username).where(User.username == "layla")) == "layla"
    assert db.scalar(select(Post.id)) is not None
