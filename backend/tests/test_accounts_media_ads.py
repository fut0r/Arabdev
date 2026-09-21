from app.core.config import settings
from tests.conftest import API, PASSWORD, image_bytes


def test_onboarding_profile_and_settings(client, make_user):
    account = make_user("layla")
    interests = client.get(f"{API}/interests").json()
    assert len(interests) == 25 and interests[0]["slug"] == "javascript"

    me = client.patch(
        f"{API}/users/me/profile",
        json={"display_name": "  ليلى  ", "bio": "Frontend", "website": "layla.dev"},
        headers=account.headers,
    ).json()
    assert me["display_name"] == "ليلى" and me["website"] == "https://layla.dev"

    me = client.put(
        f"{API}/users/me/interests", json={"interest_ids": [interests[2]["id"], interests[0]["id"]]}, headers=account.headers
    ).json()
    assert [i["slug"] for i in me["interests"]] == ["javascript", "python"]
    bad = client.put(f"{API}/users/me/interests", json={"interest_ids": [99999]}, headers=account.headers)
    assert bad.json()["code"] == "interest_invalid"

    me = client.post(f"{API}/users/me/onboarding/complete", headers=account.headers).json()
    assert me["onboarding_completed"] is True

    settings_out = client.patch(
        f"{API}/users/me/settings", json={"theme": "dark", "language": "en"}, headers=account.headers
    ).json()
    assert settings_out["theme"] == "dark" and settings_out["language"] == "en"
    assert client.patch(f"{API}/users/me/settings", json={"theme": "neon"}, headers=account.headers).status_code == 422


def test_change_username_and_email(client, make_user):
    make_user("taken")
    account = make_user("layla")
    assert client.patch(f"{API}/users/me/username", json={"username": "taken"}, headers=account.headers).json()["code"] == "username_taken"
    assert client.patch(f"{API}/users/me/username", json={"username": "Layla_New"}, headers=account.headers).json()["username"] == "layla_new"

    wrong = client.post(
        f"{API}/users/me/email", json={"email": "new@example.com", "current_password": "nope"}, headers=account.headers
    )
    assert wrong.json()["code"] == "current_password_invalid"
    ok = client.post(
        f"{API}/users/me/email", json={"email": "New@Example.com", "current_password": PASSWORD}, headers=account.headers
    )
    assert ok.json()["status"] == "updated"
    assert ok.json()["user"]["email"] == "new@example.com"


def test_avatar_upload_is_validated_and_reencoded(client, make_user):
    account = make_user("layla")
    response = client.post(
        f"{API}/users/me/avatar",
        files={"file": ("me.png", image_bytes((900, 600)), "image/png")},
        headers=account.headers,
    )
    assert response.status_code == 200, response.text
    url = response.json()["avatar_url"]
    assert url.startswith("/media/avatar/") and url.endswith(".webp")

    served = client.get(url)
    assert served.status_code == 200
    assert served.headers["cache-control"].startswith("public")
    from io import BytesIO

    from PIL import Image

    image = Image.open(BytesIO(served.content))
    assert image.format == "WEBP" and image.size == (400, 400)

    replaced = client.post(
        f"{API}/users/me/avatar", files={"file": ("b.jpg", image_bytes(fmt="JPEG"), "image/jpeg")}, headers=account.headers
    ).json()["avatar_url"]
    assert replaced != url
    assert client.get(url).status_code == 404  # the old file was cleaned up

    removed = client.delete(f"{API}/users/me/avatar", headers=account.headers).json()
    assert removed["avatar_url"] is None


def test_upload_rejects_bad_files(client, make_user):
    account = make_user("layla")

    def upload(content, name="x.png", ctype="image/png"):
        return client.post(f"{API}/users/me/avatar", files={"file": (name, content, ctype)}, headers=account.headers)

    assert upload(b"#!/bin/sh\nrm -rf /\n").json()["code"] == "file_not_image"
    assert upload(b"MZ\x90\x00", name="evil.exe", ctype="application/x-msdownload").json()["code"] == "file_type_not_allowed"
    assert upload(image_bytes((40, 40))).json()["code"] == "image_too_small"
    assert upload(image_bytes(fmt="BMP"), ctype="image/png").json()["code"] == "file_type_not_allowed"
    too_big = b"\x89PNG" + b"0" * (settings.max_upload_bytes + 10)
    assert upload(too_big).json()["code"] == "file_too_large"


def test_post_images_belong_to_their_uploader(client, make_user):
    owner = make_user("layla")
    thief = make_user("omar")
    media = client.post(
        f"{API}/media", files={"file": ("p.png", image_bytes((2400, 1200)), "image/png")}, headers=owner.headers
    ).json()
    assert (media["width"], media["height"]) == (1600, 800)

    stolen = client.post(
        f"{API}/posts", json={"content_html": "<p>x</p>", "image_media_id": media["id"]}, headers=thief.headers
    )
    assert stolen.json()["code"] == "media_not_owned"

    post = client.post(
        f"{API}/posts", json={"content_html": "<p>x</p>", "image_media_id": media["id"]}, headers=owner.headers
    ).json()
    assert post["image"]["url"] == media["url"]
    assert client.delete(f"{API}/media/{media['id']}", headers=owner.headers).json()["code"] == "media_in_use"

    client.delete(f"{API}/posts/{post['id']}", headers=owner.headers)
    assert client.get(media["url"]).status_code == 404  # orphaned image removed with the post


def test_delete_account_cleans_up_counters(client, make_user, make_post):
    author = make_user("layla")
    leaving = make_user("omar")
    post = make_post(author)
    client.post(f"{API}/posts/{post['id']}/like", headers=leaving.headers)
    client.post(f"{API}/posts/{post['id']}/comments", json={"content": "bye"}, headers=leaving.headers)

    wrong = client.request("DELETE", f"{API}/users/me", json={"password": "nope"}, headers=leaving.headers)
    assert wrong.status_code == 422
    assert client.request("DELETE", f"{API}/users/me", json={"password": PASSWORD}, headers=leaving.headers).status_code == 204

    refreshed = client.get(f"{API}/posts/{post['id']}").json()
    assert refreshed["likes_count"] == 0 and refreshed["comments_count"] == 0
    assert client.get(f"{API}/users/omar").status_code == 404


def test_ads_rotate_predictably_and_track_clicks(client, make_user):
    admin = make_user("boss")
    first = client.get(f"{API}/ads", params={"placement": "feed", "lang": "en", "limit": 2, "offset": 0}).json()
    second = client.get(f"{API}/ads", params={"placement": "feed", "lang": "en", "limit": 2, "offset": 1}).json()
    assert len(first) == 2 and first[1]["id"] == second[0]["id"]
    assert all(ad["sponsor"] == "ArabDev" for ad in first)

    assert client.post(f"{API}/ads/{first[0]['id']}/click").status_code == 204
    assert client.get(f"{API}/ads/manage", headers=admin.headers).json()["code"] == "admin_required"


def test_rate_limiting(client, make_user, monkeypatch):
    make_user("layla")
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    codes = [
        client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": "Wrong1234"}).status_code
        for _ in range(12)
    ]
    # Eight wrong passwords for one address is where the account-level limit bites,
    # before the per-network limit of ten would.
    assert codes[:8] == [401] * 8
    assert codes[8] == 429
    assert codes[-1] == 429


def test_health_and_docs(client):
    assert client.get(f"{API}/health").json()["database"] == "ok"
    spec = client.get(f"{API}/openapi.json").json()
    tags = {tag["name"] for tag in spec["tags"]}
    assert {"Authentication", "Users", "Posts", "Comments", "Interactions", "Search", "Notifications",
            "Interests", "Media", "Ads"} <= tags


def test_errors_never_leak_internals(client):
    response = client.get(f"{API}/posts/not-a-number")
    assert response.status_code == 422
    assert set(response.json()) == {"detail", "code", "errors"}
    assert client.get(f"{API}/nope").json() == {"detail": "Not Found", "code": "not_found"}
