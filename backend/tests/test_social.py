from datetime import timedelta

from sqlalchemy import update

from app.models import Post
from app.utils.time import utcnow
from tests.conftest import API


def notifications(client, account):
    return client.get(f"{API}/notifications", headers=account.headers).json()["items"]


def test_interactions_are_idempotent_and_counted(client, make_user, make_post):
    author = make_user("layla")
    fan = make_user("omar")
    post = make_post(author)
    url = f"{API}/posts/{post['id']}"

    for _ in range(2):
        state = client.post(f"{url}/like", headers=fan.headers).json()
    assert state["liked"] is True and state["likes_count"] == 1

    client.post(f"{url}/bookmark", headers=fan.headers)
    client.post(f"{url}/repost", headers=fan.headers)
    viewed = client.get(url, headers=fan.headers).json()
    assert (viewed["liked"], viewed["bookmarked"], viewed["reposted"]) == (True, True, True)
    assert viewed["reposts_count"] == 1

    bookmarks = client.get(f"{API}/users/me/bookmarks", headers=fan.headers).json()
    assert [item["id"] for item in bookmarks["items"]] == [post["id"]]

    for _ in range(2):
        state = client.delete(f"{url}/like", headers=fan.headers).json()
    assert state["liked"] is False and state["likes_count"] == 0

    own_repost = client.post(f"{url}/repost", headers=author.headers)
    assert own_repost.json()["code"] == "cannot_repost_own"


def test_following_feed_includes_reposts(client, make_user, make_post):
    viewer = make_user("viewer")
    friend = make_user("friend")
    stranger = make_user("stranger")
    stranger_post = make_post(stranger, title="From a stranger")
    make_post(friend, title="From a friend")

    client.post(f"{API}/users/{friend.id}/follow", headers=viewer.headers)
    feed = client.get(f"{API}/posts", params={"tab": "following"}, headers=viewer.headers).json()
    assert [item["title"] for item in feed["items"]] == ["From a friend"]

    client.post(f"{API}/posts/{stranger_post['id']}/repost", headers=friend.headers)
    feed = client.get(f"{API}/posts", params={"tab": "following"}, headers=viewer.headers).json()
    assert [item["title"] for item in feed["items"]] == ["From a stranger", "From a friend"]
    assert feed["items"][0]["reposted_by"]["username"] == "friend"
    assert feed["items"][1]["reposted_by"] is None
    assert feed["total"] == 2

    profile = client.get(f"{API}/users/friend/posts").json()
    assert [item["title"] for item in profile["items"]] == ["From a stranger", "From a friend"]


def test_for_you_ranks_follows_and_interests_first_within_a_day(client, make_user, make_post, db):
    viewer = make_user("viewer")
    friend = make_user("friend")
    other = make_user("other")
    python_id = next(i["id"] for i in client.get(f"{API}/interests").json() if i["slug"] == "python")
    client.put(f"{API}/users/me/interests", json={"interest_ids": [python_id]}, headers=viewer.headers)
    client.post(f"{API}/users/{friend.id}/follow", headers=viewer.headers)

    older_friend = make_post(friend, title="Friend, yesterday")
    make_post(other, title="Unrelated, newest")
    make_post(other, title="Python post", tags=["python"])
    make_post(friend, title="Friend, today")
    db.execute(update(Post).where(Post.id == older_friend["id"]).values(created_at=utcnow() - timedelta(days=1)))
    db.commit()

    feed = client.get(f"{API}/posts", params={"tab": "for_you"}, headers=viewer.headers).json()
    titles = [item["title"] for item in feed["items"]]
    assert titles == ["Friend, today", "Python post", "Unrelated, newest", "Friend, yesterday"]


def test_notifications_and_preferences(client, make_user, make_post):
    author = make_user("layla")
    fan = make_user("omar")
    post = make_post(author)

    client.post(f"{API}/users/{author.id}/follow", headers=fan.headers)
    client.post(f"{API}/posts/{post['id']}/like", headers=fan.headers)
    client.post(f"{API}/posts/{post['id']}/repost", headers=fan.headers)
    client.post(f"{API}/posts/{post['id']}/comments", json={"content": "Nice one @layla"}, headers=fan.headers)
    make_post(fan, content="<p>Thanks @layla and @nobody_here</p>")

    kinds = sorted(n["type"] for n in notifications(client, author))
    assert kinds == ["comment", "follow", "like", "mention", "repost"]
    assert client.get(f"{API}/notifications/unread-count", headers=author.headers).json() == {"count": 5}

    # Unliking withdraws the unread like notification; liking again doesn't duplicate it.
    client.delete(f"{API}/posts/{post['id']}/like", headers=fan.headers)
    client.post(f"{API}/posts/{post['id']}/like", headers=fan.headers)
    client.post(f"{API}/posts/{post['id']}/like", headers=fan.headers)
    assert sum(n["type"] == "like" for n in notifications(client, author)) == 1

    first = notifications(client, author)[0]
    assert client.post(f"{API}/notifications/{first['id']}/read", headers=author.headers).status_code == 204
    assert client.post(f"{API}/notifications/{first['id']}/read", headers=fan.headers).status_code == 404
    client.post(f"{API}/notifications/read-all", headers=author.headers)
    assert client.get(f"{API}/notifications/unread-count", headers=author.headers).json() == {"count": 0}

    # Preferences are enforced by the server.
    client.patch(
        f"{API}/users/me/settings", json={"notify_likes": False, "mentions_from": "following"}, headers=author.headers
    )
    stranger = make_user("stranger")
    client.post(f"{API}/posts/{post['id']}/like", headers=stranger.headers)
    make_post(stranger, content="<p>hey @layla</p>")
    assert [n for n in notifications(client, author) if n["actor"]["username"] == "stranger"] == []


def test_comments_and_delete_permissions(client, make_user, make_post):
    author = make_user("layla")
    commenter = make_user("omar")
    bystander = make_user("sara")
    post = make_post(author)
    url = f"{API}/posts/{post['id']}/comments"

    parent = client.post(url, json={"content": "First!"}, headers=commenter.headers).json()
    reply = client.post(url, json={"content": "Reply", "parent_id": parent["id"]}, headers=author.headers).json()
    assert reply["parent_id"] == parent["id"]
    assert client.post(url, json={"content": "   "}, headers=commenter.headers).status_code == 422

    listing = client.get(url, headers=author.headers).json()
    assert listing["total"] == 2
    assert all(item["can_delete"] for item in listing["items"])  # post author can moderate
    assert client.get(f"{API}/posts/{post['id']}").json()["comments_count"] == 2

    replies_tab = client.get(f"{API}/users/omar/replies").json()
    assert replies_tab["items"][0]["post"]["id"] == post["id"]

    assert client.delete(f"{API}/comments/{parent['id']}", headers=bystander.headers).status_code == 403
    assert client.delete(f"{API}/comments/{parent['id']}", headers=author.headers).status_code == 204
    assert client.get(f"{API}/posts/{post['id']}").json()["comments_count"] == 0  # reply went with it


def test_follow_rules_and_privacy(client, make_user):
    layla = make_user("layla")
    omar = make_user("omar")

    assert client.post(f"{API}/users/{layla.id}/follow", headers=layla.headers).json()["code"] == "cannot_follow_self"
    state = client.post(f"{API}/users/{layla.id}/follow", headers=omar.headers).json()
    assert state == {"user_id": layla.id, "following": True, "followers_count": 1}

    profile = client.get(f"{API}/users/layla", headers=omar.headers).json()
    assert profile["is_following"] is True and profile["followers_count"] == 1
    assert client.get(f"{API}/users/omar", headers=layla.headers).json()["follows_you"] is True

    client.patch(f"{API}/users/me/settings", json={"show_follow_lists": False}, headers=layla.headers)
    assert client.get(f"{API}/users/layla/followers", headers=omar.headers).json()["code"] == "follow_lists_private"
    assert client.get(f"{API}/users/layla/followers", headers=layla.headers).json()["total"] == 1

    state = client.delete(f"{API}/users/{layla.id}/follow", headers=omar.headers).json()
    assert state["following"] is False and state["followers_count"] == 0


def test_recommendations_use_interests_and_follows(client, make_user):
    interests = {i["slug"]: i["id"] for i in client.get(f"{API}/interests").json()}
    viewer = make_user("viewer")
    rustacean = make_user("rustacean")
    pythonista = make_user("pythonista")
    hidden = make_user("hidden_rust")
    followed = make_user("already")

    client.put(
        f"{API}/users/me/interests",
        json={"interest_ids": [interests["rust"], interests["linux"]]},
        headers=viewer.headers,
    )
    client.put(
        f"{API}/users/me/interests",
        json={"interest_ids": [interests["rust"], interests["linux"]]},
        headers=rustacean.headers,
    )
    client.put(f"{API}/users/me/interests", json={"interest_ids": [interests["python"]]}, headers=pythonista.headers)
    client.put(f"{API}/users/me/interests", json={"interest_ids": [interests["rust"]]}, headers=hidden.headers)
    client.patch(f"{API}/users/me/settings", json={"discoverable": False}, headers=hidden.headers)
    client.post(f"{API}/users/{followed.id}/follow", headers=viewer.headers)

    names = [card["username"] for card in client.get(f"{API}/users/recommended", headers=viewer.headers).json()]
    assert names[0] == "rustacean"
    assert "viewer" not in names and "hidden_rust" not in names and "already" not in names
    assert "pythonista" in names


def test_search(client, make_user, make_post):
    author = make_user("layla_dev")
    client.patch(f"{API}/users/me/profile", json={"display_name": "ليلى حسن", "bio": "React"}, headers=author.headers)
    make_post(author, title="Understanding Rust lifetimes", tags=["rust"])
    make_post(author, title="100% coverage is a trap")

    results = client.get(f"{API}/search", params={"q": "rust"}).json()
    assert results["posts"]["total"] == 1
    assert results["tags"]["items"][0] == {"slug": "rust", "name": "rust", "posts_count": 1}

    assert (
        client.get(f"{API}/search", params={"q": "ليلى", "type": "users"}).json()["users"]["items"][0]["username"]
        == "layla_dev"
    )
    assert client.get(f"{API}/search", params={"q": "@layla", "type": "users"}).json()["users"]["total"] == 1

    # LIKE wildcards in the query are treated literally.
    percent = client.get(f"{API}/search", params={"q": "100%", "type": "posts"}).json()
    assert percent["posts"]["total"] == 1
    assert client.get(f"{API}/search", params={"q": "%", "type": "posts"}).json()["posts"]["total"] == 1
