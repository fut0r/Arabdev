"""1.4: permissions, private reading data, search and safe editing."""

from datetime import timedelta

from sqlalchemy import update

from app.models import Post, User
from app.utils.time import utcnow
from tests.conftest import API


def test_preferences_round_trip_and_validation(client, make_user):
    member = make_user()
    prefs = {
        "accent_color": "#146C94",
        "font_family": "alexandria",
        "font_size": 20,
        "background": "grid",
        "density": "compact",
        "reading_width": "wide",
        "email_weekly_digest": True,
    }
    result = client.patch(f"{API}/users/me/settings", headers=member.headers, json=prefs)
    assert result.status_code == 200
    assert all(result.json()[key] == value for key, value in prefs.items())
    assert client.get(f"{API}/users/me", headers=member.headers).json()["settings"]["background"] == "grid"
    for invalid in ({"accent_color": "url(https://example.org)"}, {"font_size": 100}, {"background": "external"}):
        assert client.patch(f"{API}/users/me/settings", headers=member.headers, json=invalid).status_code == 422


def test_arabic_search_normalizes_and_ranks_titles(client, make_user, make_post):
    author = make_user()
    exact = make_post(author, title="إدارة قواعد البيانات", content="<p>دليل عملي للمطور العربي.</p>")
    make_post(author, title="ملاحظات", content="<p>تعلم إدارة قواعد البيانات في التطبيق.</p>")
    results = client.get(f"{API}/search", params={"q": "ادارة قواعد البيانات", "type": "posts"}).json()["posts"][
        "items"
    ]
    assert len(results) == 2
    assert results[0]["id"] == exact["id"]


def test_trending_ranges_do_not_mislabel_old_content(client, make_user, make_post, db):
    author = make_user()
    post = make_post(author)
    db.execute(update(Post).where(Post.id == post["id"]).values(created_at=utcnow() - timedelta(days=60)))
    db.commit()
    assert client.get(f"{API}/browse", params={"sort": "trending", "days": 7}).json()["total"] == 0
    assert client.get(f"{API}/browse", params={"sort": "trending", "days": 0}).json()["total"] == 1
    assert client.get(f"{API}/posts/trending").json()["total"] == 0


def test_question_answer_requires_owner_and_matching_comment(client, make_user, make_post):
    author, helper = make_user(), make_user("helper")
    question = make_post(author, kind="question", content="<p>كيف أبدأ مشروعًا برمجيًا؟</p>")
    other = make_post(helper)
    answer = client.post(
        f"{API}/posts/{question['id']}/comments",
        headers=helper.headers,
        json={"content": "ابدأ بتحديد المشكلة وكتابة مثال صغير."},
    ).json()
    wrong = client.post(
        f"{API}/posts/{other['id']}/comments", headers=helper.headers, json={"content": "Another answer"}
    ).json()
    url = f"{API}/posts/{question['id']}/answer"
    assert client.put(url, headers=helper.headers, json={"comment_id": answer["id"]}).status_code == 403
    assert client.put(url, headers=author.headers, json={"comment_id": wrong["id"]}).status_code == 404
    accepted = client.put(url, headers=author.headers, json={"comment_id": answer["id"]})
    assert accepted.status_code == 200
    assert accepted.json()["accepted_comment_id"] == answer["id"]
    assert client.get(f"{API}/browse", params={"unanswered": True}).json()["total"] == 0
    client.delete(f"{API}/comments/{answer['id']}", headers=helper.headers)
    assert client.get(f"{API}/posts/{question['id']}").json()["accepted_comment_id"] is None


def test_private_collections_survive_collection_deletion(client, make_user, make_post):
    owner, stranger = make_user(), make_user("stranger")
    post = make_post(stranger)
    collection = client.post(f"{API}/library/collections", headers=owner.headers, json={"name": "تعلم"}).json()
    collection_id = collection["id"]
    url = f"{API}/library/bookmarks/{post['id']}"
    assert client.put(url, headers=stranger.headers, json={"collection_id": collection_id}).status_code == 404
    saved = client.put(
        url, headers=owner.headers, json={"collection_id": collection_id, "note": "My private reading note"}
    )
    assert saved.status_code == 200
    assert saved.json()["bookmark_note"] == "My private reading note"
    public = client.get(f"{API}/posts/{post['id']}").json()
    assert public["bookmark_note"] is None and public["bookmark_collection_id"] is None
    assert client.delete(f"{API}/library/collections/{collection_id}", headers=stranger.headers).status_code == 404
    assert (
        client.get(f"{API}/users/me/bookmarks", headers=owner.headers, params={"collection_id": collection_id}).json()[
            "total"
        ]
        == 1
    )
    assert client.delete(f"{API}/library/collections/{collection_id}", headers=owner.headers).status_code == 204
    remaining = client.get(f"{API}/users/me/bookmarks", headers=owner.headers).json()["items"][0]
    assert remaining["bookmark_collection_id"] is None
    assert remaining["bookmark_note"] == "My private reading note"


def test_series_order_and_ownership(client, make_user, make_post):
    owner, stranger = make_user(), make_user("stranger")
    series = client.post(f"{API}/series", headers=owner.headers, json={"title": "دليل Python"}).json()
    second = make_post(owner, series_id=series["id"], series_order=2)
    first = make_post(owner, series_id=series["id"], series_order=1)
    denied = client.post(
        f"{API}/posts", headers=stranger.headers, json={"content_html": "<p>Not mine</p>", "series_id": series["id"]}
    )
    assert denied.status_code == 403
    listing = client.get(f"{API}/browse", params={"series_id": series["id"]}).json()["items"]
    assert [p["id"] for p in listing] == [first["id"], second["id"]]
    assert client.delete(f"{API}/series/{series['id']}", headers=owner.headers).status_code == 204
    assert client.get(f"{API}/posts/{first['id']}").json()["series_id"] is None


def test_draft_revision_prevents_lost_updates(client, make_user):
    owner = make_user()
    draft = client.post(
        f"{API}/drafts", headers=owner.headers, json={"content_html": "<p>First draft</p>", "kind": "question"}
    ).json()
    url = f"{API}/drafts/{draft['id']}"
    first = client.put(
        url,
        headers=owner.headers,
        json={"content_html": "<p>Second draft</p>", "expected_revision": draft["revision"], "kind": "question"},
    )
    assert first.status_code == 200
    assert first.json()["revision"] == 2
    stale = client.put(url, headers=owner.headers, json={"content_html": "<p>Stale tab</p>", "expected_revision": 1})
    assert stale.status_code == 409
    assert "Second draft" in client.get(url, headers=owner.headers).json()["content_html"]


def test_followed_topics_and_editorial_permissions(client, make_user, make_post, db):
    author, reader = make_user(), make_user("reader")
    post = make_post(author, tags=["python"], kind="project", repository_url="https://github.com/example/project")
    url = f"{API}/topics/python/follow"
    assert client.put(url, headers=reader.headers, json={"following": True}).status_code == 200
    assert client.get(f"{API}/topics/following", headers=reader.headers).json()[0]["slug"] == "python"
    assert client.put(url, headers=reader.headers, json={"following": False}).status_code == 200
    assert client.get(f"{API}/topics/following", headers=reader.headers).json() == []
    featured = f"{API}/posts/{post['id']}/featured"
    assert client.put(featured, headers=reader.headers, json={"featured": True}).status_code == 403
    db.execute(update(User).where(User.id == author.id).values(is_admin=True))
    db.commit()
    assert client.put(featured, headers=author.headers, json={"featured": True}).status_code == 200
    assert client.get(f"{API}/browse", params={"sort": "featured"}).json()["items"][0]["id"] == post["id"]


def test_content_language_is_detected_and_filters_work(client, make_user, make_post):
    author = make_user()
    arabic = make_post(author, content="<p>تعلم البرمجة خطوة بخطوة مع أمثلة عملية واضحة</p>")
    english = make_post(author, content="<p>Build a small application with practical examples.</p>", kind="note")
    assert arabic["language"] == "ar" and english["language"] == "en"
    result = client.get(f"{API}/browse", params={"kind": "note", "language": "en"}).json()
    assert [p["id"] for p in result["items"]] == [english["id"]]


def test_new_unverified_reporters_cannot_hide_posts(client, make_user, make_post, db):
    author = make_user("author")
    post = make_post(author)
    for name in ("newone", "newtwo", "newthree"):
        reporter = make_user(name)
        assert (
            client.post(
                f"{API}/posts/{post['id']}/report", headers=reporter.headers, json={"reason": "spam"}
            ).status_code
            == 200
        )
    assert client.get(f"{API}/posts/{post['id']}").status_code == 200
    from sqlalchemy import select

    from app.models import Report

    assert len(list(db.scalars(select(Report)))) == 3


def test_digest_is_opt_in_idempotent_and_unsubscribe_requires_post(client, make_user, make_post, db, monkeypatch):
    from app.core.config import settings
    from app.models import UserSettings
    from app.services import digest_service, email_service

    author, reader = make_user("author"), make_user("reader")
    make_post(author, title="Useful article")
    db.execute(update(User).where(User.id == reader.id).values(email_verified_at=utcnow()))
    db.get(UserSettings, reader.id).email_weekly_digest = True
    db.commit()
    monkeypatch.setattr(settings, "weekly_digest_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "test.invalid")
    delivered = []
    monkeypatch.setattr(email_service, "send", lambda message: delivered.append(message) or True)
    assert digest_service.deliver_weekly(db, time_budget=0)["processed"] == 0
    assert digest_service.deliver_weekly(db)["sent"] == 1
    assert digest_service.deliver_weekly(db)["sent"] == 0
    assert delivered[0].to == reader.email
    token = digest_service.unsubscribe_token(db.get(User, reader.id))
    assert client.get(f"{API}/digest/unsubscribe", params={"token": token}).status_code == 200
    db.expire_all()
    assert db.get(UserSettings, reader.id).email_weekly_digest is True
    assert client.post(f"{API}/digest/unsubscribe", params={"token": token}).status_code == 200
    db.expire_all()
    assert db.get(UserSettings, reader.id).email_weekly_digest is False
    assert client.post(f"{API}/digest/unsubscribe", params={"token": token + "x"}).status_code == 400


def test_github_state_verified_email_linking_and_two_factor(client, make_user, db, monkeypatch):
    from urllib.parse import parse_qs, urlparse

    from app.core.config import settings
    from app.services import github_service
    from tests.conftest import PASSWORD

    member = make_user("existing")
    monkeypatch.setattr(settings, "github_client_id", "fake-client")
    monkeypatch.setattr(settings, "github_client_secret", "fake-secret")
    calls = []

    def github(url, **kwargs):
        calls.append(url)
        if url.endswith("access_token"):
            assert kwargs["data"]["code_verifier"]
            return {"access_token": "fake-provider-token"}
        if url.endswith("/emails"):
            return [{"email": member.email, "verified": True, "primary": True}]
        return {"id": 12345, "login": "existing"}

    monkeypatch.setattr(github_service, "_request", github)
    started = client.post(f"{API}/auth/github/start", json={}).json()
    state = parse_qs(urlparse(started["url"]).query)["state"][0]
    bad = client.post(f"{API}/auth/github/complete", json={"code": "code", "state": "x" * 32})
    assert bad.status_code == 400 and calls == []
    collision = client.post(f"{API}/auth/github/complete", json={"code": "code", "state": state})
    assert collision.status_code == 409 and collision.json()["code"] == "github_link_existing"
    started = client.post(
        f"{API}/auth/github/start", headers=member.headers, json={"link": True, "password": PASSWORD}
    ).json()
    state = parse_qs(urlparse(started["url"]).query)["state"][0]
    linked = client.post(f"{API}/auth/github/complete", headers=member.headers, json={"code": "code", "state": state})
    assert linked.status_code == 200 and linked.json()["tokens"]["user"]["id"] == member.id
    user = db.get(User, member.id)
    user.totp_secret = "test-encrypted-secret"
    user.totp_enabled_at = utcnow()
    db.commit()
    started = client.post(f"{API}/auth/github/start", json={}).json()
    state = parse_qs(urlparse(started["url"]).query)["state"][0]
    login = client.post(f"{API}/auth/github/complete", json={"code": "new-code", "state": state})
    assert login.status_code == 200
    assert login.json()["status"] == "verification_required"
    assert login.json()["challenge"]["purpose"] == "login_2fa"


def test_s3_urls_preserve_existing_media(monkeypatch):
    from app.core.config import settings
    from app.services.storage import S3Storage

    monkeypatch.setattr(settings, "s3_public_url", "https://images.example.com")
    storage = object.__new__(S3Storage)
    assert storage.url("s3/post_image/new.webp") == "https://images.example.com/post_image/new.webp"
    assert storage.url("post_image/old.webp") == f"{settings.media_url}/post_image/old.webp"


def test_publishing_stale_draft_does_not_delete_newer_work(client, make_user):
    user = make_user()
    original = {"title": "A draft", "content_html": "<p>Version one</p>"}
    draft = client.post(f"{API}/drafts", headers=user.headers, json=original).json()
    changed = client.put(
        f"{API}/drafts/{draft['id']}",
        headers=user.headers,
        json={"content_html": "<p>Newer work</p>", "expected_revision": draft["revision"]},
    )
    assert changed.status_code == 200
    result = client.post(
        f"{API}/posts",
        headers=user.headers,
        json={**original, "draft_id": draft["id"], "expected_revision": draft["revision"]},
    )
    assert result.status_code == 409
    assert "Newer work" in client.get(f"{API}/drafts/{draft['id']}", headers=user.headers).json()["content_html"]
    assert client.get(f"{API}/browse").json()["total"] == 0


def test_developer_directory_respects_discovery_preferences(client, make_user):
    viewer, hidden, visible = make_user("viewer"), make_user("hidden"), make_user("visible")
    client.patch(f"{API}/users/me/settings", headers=hidden.headers, json={"discoverable": False})
    for query in ("", "hidd"):
        response = client.get(f"{API}/developers", params={"q": query}, headers=viewer.headers)
        assert response.status_code == 200
        assert hidden.id not in [item["id"] for item in response.json()["items"]]
    assert visible.id in [item["id"] for item in client.get(f"{API}/developers").json()["items"]]
    # Existing privacy semantics still allow lookup by an exact known username.
    exact = client.get(f"{API}/developers", params={"q": "hidden"}, headers=viewer.headers).json()
    assert [item["id"] for item in exact["items"]] == [hidden.id]
