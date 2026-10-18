"""IndexNow submissions, its key file, and the dates the sitemap gives search engines."""

import json
import urllib.error
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

import pytest
from sqlalchemy import update

from app.core.config import settings
from app.models import Post
from app.services import indexnow
from tests.conftest import API


class FakeResponse:
    status = 202

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def sent(monkeypatch):
    """Turns IndexNow on and records what would have been sent, instead of sending it."""
    requests: list[dict] = []

    def fake_urlopen(request, timeout):
        assert request.full_url == indexnow.ENDPOINT
        requests.append(json.loads(request.data))
        return FakeResponse()

    monkeypatch.setattr(settings, "indexnow_enabled", True)
    monkeypatch.setattr(indexnow.urllib.request, "urlopen", fake_urlopen)
    return requests


def test_the_key_file_is_served_at_the_root(client):
    key = indexnow.key()
    response = client.get(f"/{key}.txt")
    assert response.status_code == 200
    assert response.text == key
    assert response.headers["content-type"].startswith("text/plain")
    assert client.get(f"/{'0' * 32}.txt").status_code == 404
    assert client.get("/notes.txt").status_code == 404


def test_publishing_editing_and_deleting_tell_the_engines(client, make_user, make_post, sent):
    author = make_user("layla")
    post = make_post(author, title="Pagination", tags=["python", "databases"])

    base = settings.frontend_url.rstrip("/")
    first = sent[-1]
    assert first["key"] == indexnow.key()
    assert first["keyLocation"] == f"{base}/{indexnow.key()}.txt"
    assert first["host"] == urlsplit(base).hostname
    assert first["urlList"] == [
        f"{base}/posts/{post['id']}",
        f"{base}/u/layla",
        f"{base}/tags/databases",
        f"{base}/tags/python",
        f"{base}/",
    ]

    client.put(f"{API}/posts/{post['id']}", json={"content_html": "<p>Edited</p>"}, headers=author.headers)
    assert f"{base}/posts/{post['id']}" in sent[-1]["urlList"]

    client.delete(f"{API}/posts/{post['id']}", headers=author.headers)
    assert sent[-1]["urlList"][0] == f"{base}/posts/{post['id']}"
    assert len(sent) == 3


def test_hidden_accounts_profiles_are_not_sent(client, make_user, make_post, sent):
    author = make_user("layla")
    client.patch(f"{API}/users/me/settings", json={"discoverable": False}, headers=author.headers)
    make_post(author)
    assert not any("/u/layla" in url for url in sent[-1]["urlList"])


def test_nothing_is_sent_outside_production(client, make_user, make_post, monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError("IndexNow must stay off in tests and development")

    monkeypatch.setattr(indexnow.urllib.request, "urlopen", refuse)
    make_post(make_user("layla"))
    assert settings.indexnow_active is False


def test_an_unreachable_service_does_not_affect_publishing(client, make_user, monkeypatch):
    def broken(request, timeout):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(settings, "indexnow_enabled", True)
    monkeypatch.setattr(indexnow.urllib.request, "urlopen", broken)
    author = make_user("layla")
    response = client.post(f"{API}/posts", json={"content_html": "<p>Still works</p>"}, headers=author.headers)
    assert response.status_code == 201


def test_sitemap_dates_follow_writing_and_editing_not_likes(client, make_user, make_post, db):
    post = make_post(make_user("layla"))
    written = datetime(2026, 9, 20, 12, 0, tzinfo=UTC)
    # A like or a comment moves updated_at; the sitemap must not treat that as a change.
    liked_later = datetime(2026, 10, 18, tzinfo=UTC)
    db.execute(update(Post).where(Post.id == post["id"]).values(created_at=written, updated_at=liked_later))
    db.commit()

    base = settings.frontend_url.rstrip("/")
    sitemap = client.get("/sitemap.xml").text
    assert f"/posts/{post['id']}</loc><lastmod>2026-09-20</lastmod>" in sitemap
    assert f"<loc>{base}/</loc><lastmod>2026-09-20</lastmod>" in sitemap
    assert f"<loc>{base}/about</loc><changefreq>" in sitemap  # no made-up date

    db.execute(update(Post).where(Post.id == post["id"]).values(edited_at=written + timedelta(days=3)))
    db.commit()
    assert "<lastmod>2026-09-23</lastmod>" in client.get("/sitemap.xml").text
