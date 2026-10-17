"""RSS feeds for the whole site, one member and one tag."""

import xml.etree.ElementTree as ET

from sqlalchemy import update

from app.models import UserSettings


def items(response) -> list[dict]:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/rss+xml")
    channel = ET.fromstring(response.content).find("channel")
    return [{child.tag: child.text for child in item} for item in channel.findall("item")]


def test_the_site_feed_lists_the_latest_posts(client, make_user, make_post):
    author = make_user("layla")
    make_post(author, title="First", content="<p>Hello <b>world</b> & friends</p>", tags=["python"])
    make_post(author, title="Second <script>", content="<p>More</p>")

    feed = items(client.get("/rss.xml"))
    assert [item["title"] for item in feed] == ["Second <script>", "First"]  # escaped in XML, intact once parsed
    first = feed[1]
    assert first["link"].startswith("http") and "/posts/" in first["link"]
    assert first["description"] == "Hello world & friends"
    assert first["category"] == "python"
    assert first["pubDate"].endswith("+0000")


def test_member_and_tag_feeds(client, make_user, make_post, db):
    layla = make_user("layla")
    omar = make_user("omar")
    make_post(layla, title="By Layla", tags=["rust"])
    make_post(omar, title="By Omar", tags=["python"])

    assert [item["title"] for item in items(client.get("/u/layla/rss.xml"))] == ["By Layla"]
    assert [item["title"] for item in items(client.get("/tags/Python/rss.xml"))] == ["By Omar"]
    assert client.get("/tags/no-such-tag/rss.xml").status_code == 404
    assert client.get("/u/nobody_here/rss.xml").status_code == 404

    # Someone who opted out of being found gets no feed.
    db.execute(update(UserSettings).where(UserSettings.user_id == layla.id).values(discoverable=False))
    db.commit()
    assert client.get("/u/layla/rss.xml").status_code == 404
