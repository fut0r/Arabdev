"""Public pages are readable without JavaScript: the API writes each page's own title,
description and text into the app shell."""

import re

import pytest
from sqlalchemy import update

from app.core.config import settings
from app.models import Post, User, UserSettings
from app.services import page_service
from app.utils.time import utcnow
from tests.conftest import API

SHELL = """<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <title>ArabDev — home</title>
    <meta
      name="description"
      content="The homepage description"
    />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="ArabDev — home" />
    <meta property="og:description" content="The homepage description" />
    <meta property="og:image" content="https://arabdev.site/screenshots/dashboard.webp" />
    <meta property="og:image:width" content="1600" />
    <meta name="twitter:title" content="ArabDev — home" />
    <meta name="twitter:description" content="The homepage description" />
    <meta name="twitter:image" content="https://arabdev.site/screenshots/dashboard.webp" />
  </head>
  <body>
    <div id="root"><div id="prerender"><!--prerender--><!--/prerender--></div></div>
    <script type="module" src="/assets/app-abc123.js"></script>
  </body>
</html>
"""


@pytest.fixture(autouse=True)
def shell(tmp_path, monkeypatch):
    path = tmp_path / "app.html"
    path.write_text(SHELL, encoding="utf-8")
    monkeypatch.setattr(settings, "spa_shell_path", path)
    monkeypatch.setattr(settings, "frontend_url", "https://arabdev.site")
    page_service.reset_shell_cache()
    yield
    page_service.reset_shell_cache()


def text_of(html: str) -> str:
    body = html.split("<!--prerender-->")[1].split("<!--/prerender-->")[0]
    return re.sub(r"<[^>]+>", " ", body)


def test_a_post_page_carries_its_own_title_and_text(client, make_user, make_post):
    author = make_user("layla")
    post = make_post(
        author,
        title="Borrowed slices in Rust",
        content="<h2>Why</h2><p>Allocating a String per field was slow.</p><pre><code>fn main() {}</code></pre>",
        tags=["rust"],
    )
    client.post(f"{API}/posts/{post['id']}/comments", json={"content": "Great write-up"}, headers=author.headers)

    response = client.get(f"/posts/{post['id']}")
    html = response.text
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "s-maxage=60" in response.headers["cache-control"]
    assert response.headers["x-arabdev-shell"] == "file"

    assert "<title>Borrowed slices in Rust · ArabDev</title>" in html
    assert 'name="description"\n      content="Why Allocating a String per field was slow.' in html
    assert f'<link rel="canonical" href="https://arabdev.site/posts/{post["id"]}" />' in html
    assert '<meta property="og:type" content="article" />' in html
    assert '<meta property="og:title" content="Borrowed slices in Rust · ArabDev" />' in html
    assert '"@type": "DiscussionForumPosting"' in html
    # The words themselves, the tag, the author and the comment are all in the page.
    text = text_of(html)
    for expected in ("Borrowed slices in Rust", "Allocating a String per field was slow.", "fn main() {}", "#rust"):
        assert expected in text
    assert "Great write-up" in text
    assert '<a href="/u/layla">' in html and '<a href="/tags/rust">' in html
    # The app still starts from the same shell.
    assert '<script type="module" src="/assets/app-abc123.js"></script>' in html
    assert client.head(f"/posts/{post['id']}").status_code == 200


def test_text_is_escaped_not_trusted(client, make_user, make_post, db):
    author = make_user("layla")
    post = make_post(author, title="<script>alert(1)</script> & co", content="<p>hello</p>")
    # Even if something unsafe reached the stored text, it is written out as text.
    db.execute(update(Post).where(Post.id == post["id"]).values(content_text='<img src=x onerror="alert(2)">'))
    db.commit()

    html = client.get(f"/posts/{post['id']}").text
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt; &amp; co" in html
    assert "<img src=x" not in html and "&lt;img src=x" in html
    # Structured data cannot close its own script element either.
    assert "</script> & co" not in html


def test_missing_hidden_and_suspended_posts_are_not_found(client, make_user, make_post, db):
    author = make_user("layla")
    post = make_post(author, title="Soon hidden", content="<p>Secret words</p>")

    missing = client.get("/posts/999999")
    assert missing.status_code == 404
    assert client.get("/posts/99999999999999999999").status_code == 404  # larger than any id can be
    assert 'content="noindex, nofollow"' in missing.text
    assert '<script type="module"' in missing.text  # the app still loads and shows its own message

    db.execute(update(Post).where(Post.id == post["id"]).values(hidden_at=utcnow()))
    db.commit()
    hidden = client.get(f"/posts/{post['id']}")
    assert hidden.status_code == 404 and "Secret words" not in hidden.text

    db.execute(update(Post).where(Post.id == post["id"]).values(hidden_at=None))
    db.execute(update(User).where(User.id == author.id).values(is_active=False))
    db.commit()
    suspended = client.get(f"/posts/{post['id']}")
    assert suspended.status_code == 404 and "Secret words" not in suspended.text
    assert "/posts/" not in client.get("/sitemap.xml").text


def test_explore_profile_and_tag_pages_list_posts(client, make_user, make_post):
    author = make_user("layla")
    client.patch(f"{API}/users/me/profile", json={"display_name": "Layla Hassan", "bio": "I write about databases."}, headers=author.headers)
    first = make_post(author, title="Indexes explained", content="<p>B-trees first.</p>", tags=["databases"])
    make_post(author, title="Second post", content="<p>More words.</p>")

    explore = client.get("/explore")
    assert explore.status_code == 200
    assert "<title>استكشاف · ArabDev</title>" in explore.text
    assert f'<a href="/posts/{first["id"]}">Indexes explained</a>' in explore.text
    assert '<a href="/tags/databases">#databases</a>' in explore.text

    profile = client.get("/u/layla")
    assert "<title>Layla Hassan (@layla) · ArabDev</title>" in profile.text
    assert "I write about databases." in text_of(profile.text)
    assert "Indexes explained" in profile.text and "Second post" in profile.text
    assert '<meta property="og:type" content="profile" />' in profile.text

    tag = client.get("/tags/Databases")
    assert "<title>#databases · ArabDev</title>" in tag.text
    assert "Indexes explained" in tag.text and "Second post" not in tag.text

    assert client.get("/u/nobody_here").status_code == 404
    assert client.get("/tags/no-such-tag").status_code == 404


def test_accounts_that_opted_out_of_discovery_get_the_plain_shell(client, make_user, make_post, db):
    author = make_user("layla")
    make_post(author, title="Quiet post", content="<p>words</p>")
    db.execute(update(UserSettings).where(UserSettings.user_id == author.id).values(discoverable=False))
    db.commit()

    response = client.get("/u/layla")
    assert response.status_code == 200
    assert response.text == SHELL


def test_a_shell_that_cannot_be_read_still_gives_a_working_page(client, make_user, make_post, monkeypatch, tmp_path):
    post = make_post(make_user("layla"), title="Still readable", content="<p>words</p>")
    monkeypatch.setattr(settings, "spa_shell_path", tmp_path / "missing.html")
    monkeypatch.setattr(page_service, "_shell_files", lambda: [tmp_path / "missing.html"])
    monkeypatch.setattr(page_service, "_fetch_shell", lambda: None)
    page_service.reset_shell_cache()

    response = client.get(f"/posts/{post['id']}")
    assert response.status_code == 200
    assert response.headers["x-arabdev-shell"] == "fallback"
    assert "Still readable" in text_of(response.text)
    assert "fetch('/app.html')" in response.text  # the browser loads the app itself


def test_a_failure_while_writing_the_page_serves_the_shell(client, monkeypatch):
    def broken(*_args, **_kwargs):
        raise RuntimeError("database is down")

    monkeypatch.setattr(page_service, "explore_page", broken)
    response = client.get("/explore")
    assert response.status_code == 200
    assert response.text == SHELL
    assert response.headers["cache-control"] == "no-store"


def test_sitemap_lists_the_about_and_contact_pages(client):
    sitemap = client.get("/sitemap.xml").text
    assert "<loc>https://arabdev.site/about</loc>" in sitemap
    assert "<loc>https://arabdev.site/contact</loc>" in sitemap
