from datetime import timedelta

from sqlalchemy import select

from app.models import Post, Tag
from app.utils.time import utcnow
from tests.conftest import API


def test_post_html_is_sanitized(client, make_user, make_post):
    author = make_user("layla")
    post = make_post(
        author,
        content=(
            '<p style="text-align: center; position: fixed">Hi <strong onclick="steal()">there</strong></p>'
            "<script>alert(1)</script>"
            '<p><span style="color: var(--ad-text-red); font-family: Anton; font-size: 24px">styled</span>'
            '<span style="color: #00ff00; font-size: 99px; font-family: Comic Sans">ignored</span>'
            '<a href="javascript:alert(1)">bad</a><a href="https://arabdev.dev">good</a></p>'
            '<pre><code class="language-python evil">print(1)</code></pre>'
            '<table><tbody><tr><th colspan="2"><p>A</p></th></tr></tbody></table>'
            '<p dir="auto">auto</p><p dir="sideways">bad dir</p>'
        ),
    )
    html = post["content_html"]
    assert "<script" not in html and "alert(1)" not in html
    assert "onclick" not in html and "position" not in html
    assert 'style="text-align: center"' in html
    assert 'style="color: var(--ad-text-red); font-family: Anton; font-size: 24px"' in html
    assert "#00ff00" not in html and "99px" not in html and "Comic" not in html
    assert "javascript:" not in html
    assert 'href="https://arabdev.dev"' in html and 'rel="noopener noreferrer nofollow ugc"' in html
    assert 'class="language-python evil"' not in html
    assert "<table>" in html and 'colspan="2"' in html
    assert '<p dir="auto">auto</p>' in html and "sideways" not in html


def test_post_requires_content(client, make_user):
    author = make_user("layla")
    response = client.post(
        f"{API}/posts", json={"title": "Only a title", "content_html": "<p> </p>"}, headers=author.headers
    )
    assert response.status_code == 422
    assert response.json()["code"] == "post_empty"


def test_post_link_validation(client, make_user):
    author = make_user("layla")
    response = client.post(
        f"{API}/posts", json={"content_html": "<p>x</p>", "link_url": "javascript:alert(1)"}, headers=author.headers
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "url_invalid"


def test_feed_is_paginated_on_the_server(client, make_user, db):
    author = make_user("layla")
    now = utcnow()
    for index in range(25):
        db.add(
            Post(
                author_id=author.id,
                title=f"Post {index}",
                content_html=f"<p>Body {index}</p>",
                content_text=f"Body {index}",
                created_at=now - timedelta(minutes=index),
            )
        )
    db.commit()

    first = client.get(f"{API}/posts", params={"tab": "latest"}).json()
    assert (first["page"], first["limit"], first["total"], first["pages"]) == (1, 20, 25, 2)
    assert len(first["items"]) == 20
    assert first["items"][0]["title"] == "Post 0"

    second = client.get(f"{API}/posts", params={"tab": "latest", "page": 2}).json()
    assert len(second["items"]) == 5
    assert second["items"][-1]["title"] == "Post 24"

    too_many = client.get(f"{API}/posts", params={"limit": 50})
    assert too_many.status_code == 422


def test_empty_feed(client, make_user):
    viewer = make_user("layla")
    body = client.get(f"{API}/posts", headers=viewer.headers).json()
    assert body == {"items": [], "page": 1, "limit": 20, "total": 0, "pages": 0}


def test_only_the_author_can_edit_or_delete(client, make_user, make_post):
    author = make_user("layla")
    other = make_user("omar")
    post = make_post(author, title="Original")

    payload = {"title": "Changed", "content_html": "<p>Edited</p>", "tags": []}
    assert client.put(f"{API}/posts/{post['id']}", json=payload, headers=other.headers).status_code == 403
    assert client.delete(f"{API}/posts/{post['id']}", headers=other.headers).status_code == 403

    edited = client.put(f"{API}/posts/{post['id']}", json=payload, headers=author.headers).json()
    assert edited["title"] == "Changed" and edited["edited_at"] is not None

    assert client.delete(f"{API}/posts/{post['id']}", headers=author.headers).status_code == 204
    assert client.get(f"{API}/posts/{post['id']}").json()["code"] == "post_not_found"


def test_tags_are_normalized_and_linked_to_interests(client, make_user, make_post, db):
    author = make_user("layla")
    post = make_post(author, tags=["#JS", "C++", "برمجة", "js"])
    assert [tag["slug"] for tag in post["tags"]] == ["cpp", "javascript", "برمجة"]

    tags = {tag.slug: tag for tag in db.scalars(select(Tag))}
    assert tags["javascript"].interest is not None and tags["javascript"].interest.slug == "javascript"
    assert tags["برمجة"].interest is None

    by_tag = client.get(f"{API}/posts", params={"tag": "javascript"}).json()
    assert by_tag["total"] == 1
    detail = client.get(f"{API}/tags/javascript").json()
    assert detail["posts_count"] == 1 and detail["interest_slug"] == "javascript"


def test_too_many_tags(client, make_user):
    author = make_user("layla")
    response = client.post(
        f"{API}/posts",
        json={"content_html": "<p>x</p>", "tags": ["a1", "b1", "c1", "d1", "e1", "f1"]},
        headers=author.headers,
    )
    assert response.status_code == 422


def test_drafts_and_publishing_from_a_draft(client, make_user):
    author = make_user("layla")
    other = make_user("omar")
    empty = client.get(f"{API}/drafts", headers=author.headers).json()
    assert empty["total"] == 0

    draft = client.post(
        f"{API}/drafts",
        json={"title": "WIP", "content_html": "<p>half done</p>", "tags": ["rust"]},
        headers=author.headers,
    ).json()
    assert draft["tags"] == ["rust"]
    assert client.get(f"{API}/drafts/{draft['id']}", headers=other.headers).status_code == 404

    updated = client.put(
        f"{API}/drafts/{draft['id']}",
        json={"title": "Done", "content_html": "<p>finished</p>", "tags": ["rust"]},
        headers=author.headers,
    ).json()
    assert updated["title"] == "Done"

    published = client.post(
        f"{API}/posts",
        json={"title": "Done", "content_html": "<p>finished</p>", "tags": ["rust"], "draft_id": draft["id"]},
        headers=author.headers,
    )
    assert published.status_code == 201
    assert client.get(f"{API}/drafts", headers=author.headers).json()["total"] == 0


def test_trending_prefers_discussed_posts(client, make_user, make_post):
    author = make_user("layla")
    fan = make_user("omar")
    quiet = make_post(author, title="Quiet")
    loud = make_post(author, title="Loud")
    client.post(f"{API}/posts/{loud['id']}/like", headers=fan.headers)
    client.post(f"{API}/posts/{loud['id']}/comments", json={"content": "Great"}, headers=fan.headers)

    trending = client.get(f"{API}/posts/trending").json()
    assert [item["title"] for item in trending["items"]] == ["Loud", "Quiet"]
    assert quiet["id"] != loud["id"]
