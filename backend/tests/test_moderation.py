"""Reporting posts, the moderators' decisions, restrictions, and the ranking that feeds are built on."""

from datetime import timedelta

import pytest
from sqlalchemy import update

from app.core.config import settings
from app.models import Post, Report
from app.models import User
from app.services import email_service, report_service
from app.utils.time import utcnow
from tests.conftest import API, PASSWORD


@pytest.fixture
def moderator(make_user, monkeypatch):
    monkeypatch.setattr(settings, "admin_usernames", ["modteam"])
    return make_user("modteam")


def report(client, account, post_id, reason="spam", details=None):
    return client.post(f"{API}/posts/{post_id}/report", json={"reason": reason, "details": details}, headers=account.headers)


def sent_to(address: str) -> list[email_service.OutgoingEmail]:
    return [message for message in email_service.outbox if message.to == address]


def test_reporting_emails_the_author_and_the_moderators(client, make_user, make_post):
    author = make_user("layla")
    reporter = make_user("omar")
    post = make_post(author, title="Buy followers")
    email_service.outbox.clear()

    assert client.post(f"{API}/posts/{post['id']}/report", json={"reason": "spam"}).status_code == 401
    assert report(client, reporter, post["id"], reason="not-a-reason").status_code == 422
    assert report(client, author, post["id"]).json()["code"] == "cannot_report_own"

    first = report(client, reporter, post["id"], details="Links to a <b>shop</b>")
    assert first.status_code == 200
    assert first.json()["already_reported"] is False

    to_author = sent_to(author.email)
    assert len(to_author) == 1
    assert "omar" not in to_author[0].body and "omar" not in (to_author[0].html or "")  # never who reported
    to_moderators = sent_to(settings.support_email)
    assert len(to_moderators) == 1
    assert "@omar" in to_moderators[0].body and "@layla" in to_moderators[0].body
    assert "&lt;b&gt;shop&lt;/b&gt;" in to_moderators[0].html  # the reporter's words are escaped
    assert "/admin/reports?report=" in to_moderators[0].html
    assert "Anton" in to_moderators[0].html and "Tajawal" in to_moderators[0].html
    assert "email/logo.png" in to_moderators[0].html

    # Reporting again changes nothing and sends nothing.
    email_service.outbox.clear()
    again = report(client, reporter, post["id"])
    assert again.json()["already_reported"] is True
    assert email_service.outbox == []

    # The post is still visible after a single report.
    assert client.get(f"{API}/posts/{post['id']}").status_code == 200


def test_enough_reports_hide_a_post_until_reviewed(client, make_user, make_post, monkeypatch):
    monkeypatch.setattr(settings, "moderation_email", "mods@example.com")
    author = make_user("layla")
    stranger = make_user("stranger")
    post = make_post(author, title="Borderline")
    email_service.outbox.clear()

    for name in ("reporter1", "reporter2", "reporter3"):
        assert report(client, make_user(name), post["id"], reason="harassment").status_code == 200

    # The author heard about the first report and about the hiding, not every report.
    assert len(sent_to(author.email)) == 2
    assert len(sent_to("mods@example.com")) == 3
    assert "hidden until reviewed" in sent_to("mods@example.com")[-1].body

    hidden = client.get(f"{API}/posts/{post['id']}", headers=stranger.headers)
    assert hidden.status_code == 404 and hidden.json()["code"] == "post_under_review"
    assert client.get(f"{API}/posts/{post['id']}").status_code == 404
    own = client.get(f"{API}/posts/{post['id']}", headers=author.headers).json()
    assert own["under_review"] is True

    # Hidden everywhere else too, and nobody else can interact with it.
    assert client.get(f"{API}/posts", params={"tab": "latest"}).json()["total"] == 0
    assert client.get(f"{API}/posts/trending").json()["total"] == 0
    assert client.get(f"{API}/users/layla/posts").json()["total"] == 0
    assert client.post(f"{API}/posts/{post['id']}/like", headers=stranger.headers).status_code == 404
    comment = client.post(f"{API}/posts/{post['id']}/comments", json={"content": "hi"}, headers=stranger.headers)
    assert comment.status_code == 404
    assert client.get(f"{API}/posts/{post['id']}/comments").status_code == 404


def test_only_moderators_see_and_decide_reports(client, make_user, make_post, moderator):
    author = make_user("layla")
    member = make_user("omar")
    post = make_post(author)
    report(client, member, post["id"])

    for path in ("/admin/summary", "/admin/reports", "/admin/restricted"):
        assert client.get(f"{API}{path}", headers=member.headers).json()["code"] == "admin_required"
        assert client.get(f"{API}{path}").status_code == 401

    me = client.get(f"{API}/users/me", headers=moderator.headers).json()
    assert me["is_admin"] is True
    assert client.get(f"{API}/admin/summary", headers=moderator.headers).json() == {"open_cases": 1, "open_reports": 1}


def test_reports_on_one_post_are_one_case(client, make_user, make_post, moderator):
    author = make_user("layla")
    first = make_post(author, title="First")
    second = make_post(author, title="Second")
    for name in ("alpha", "bravo"):
        report(client, make_user(name), first["id"], reason="hate", details=f"by {name}")
    report(client, make_user("charlie"), second["id"])

    cases = client.get(f"{API}/admin/reports", headers=moderator.headers).json()
    assert cases["total"] == 2
    by_title = {case["post_title"]: case for case in cases["items"]}
    assert [r["details"] for r in by_title["First"]["reports"]] == ["by alpha", "by bravo"]
    assert by_title["First"]["post"]["title"] == "First"
    assert by_title["First"]["author"]["username"] == "layla"

    one = client.get(f"{API}/admin/reports/{by_title['First']['reports'][1]['id']}", headers=moderator.headers)
    assert len(one.json()["reports"]) == 2


def test_dismissing_shows_a_hidden_post_again(client, make_user, make_post, moderator):
    author = make_user("layla")
    post = make_post(author, title="Fine actually")
    reporters = [make_user(name) for name in ("reporter1", "reporter2", "reporter3")]
    for account in reporters:
        report(client, account, post["id"])
    assert client.get(f"{API}/posts/{post['id']}").status_code == 404
    case_id = client.get(f"{API}/admin/reports", headers=moderator.headers).json()["items"][0]["case_id"]
    email_service.outbox.clear()

    decided = client.post(f"{API}/admin/reports/{case_id}/decision", json={}, headers=moderator.headers).json()
    assert decided == {"status": "dismissed", "actions": [], "reports_resolved": 3}
    assert client.get(f"{API}/posts/{post['id']}").json()["under_review"] is False
    assert len(sent_to(author.email)) == 1
    assert all(len(sent_to(account.email)) == 1 for account in reporters)

    again = client.post(f"{API}/admin/reports/{case_id}/decision", json={}, headers=moderator.headers)
    assert again.status_code == 409
    assert client.get(f"{API}/admin/summary", headers=moderator.headers).json()["open_cases"] == 0
    # The decision is listed once, with the three reports it closed.
    resolved = client.get(f"{API}/admin/reports", params={"status": "resolved"}, headers=moderator.headers).json()
    assert resolved["total"] == 1
    assert len(resolved["items"][0]["reports"]) == 3
    assert resolved["items"][0]["reports"][0]["moderator"]["username"] == "modteam"
    # A moderator opening the email link later sees the decision, not an error.
    later = client.get(f"{API}/admin/reports/{case_id}", headers=moderator.headers).json()
    assert [r["status"] for r in later["reports"]] == ["dismissed"] * 3


def test_removing_a_post_and_restricting_its_author(client, make_user, make_post, moderator, db):
    author = make_user("layla")
    reporter = make_user("omar")
    other = make_post(reporter, title="Someone else's")
    post = make_post(author, title="Rude")
    report(client, reporter, post["id"], reason="harassment")
    case_id = client.get(f"{API}/admin/reports", headers=moderator.headers).json()["items"][0]["case_id"]
    email_service.outbox.clear()

    decision = {"remove_post": True, "author_action": "restrict", "restrict_days": 7, "note": "Please be kind."}
    decided = client.post(f"{API}/admin/reports/{case_id}/decision", json=decision, headers=moderator.headers)
    assert decided.json() == {"status": "actioned", "actions": ["post_removed", "author_restricted"], "reports_resolved": 1}
    assert client.get(f"{API}/posts/{post['id']}").status_code == 404

    to_author = sent_to(author.email)[0]
    assert "Please be kind." in to_author.body
    # New accounts default to Arabic, so the end date is written with an Arabic month name.
    assert report_service.format_date(utcnow() + timedelta(days=7), "ar") in to_author.body

    me = client.get(f"{API}/users/me", headers=author.headers).json()
    assert me["restricted_until"] is not None
    assert me["restriction_reason"] == "Please be kind."

    # Restricted: can read, like and bookmark, but not publish anything.
    blocked = [
        client.post(f"{API}/posts", json={"content_html": "<p>again</p>"}, headers=author.headers),
        client.post(f"{API}/posts/{other['id']}/comments", json={"content": "hey"}, headers=author.headers),
        client.post(f"{API}/posts/{other['id']}/repost", headers=author.headers),
    ]
    assert [response.json()["code"] for response in blocked] == ["account_restricted"] * 3
    assert client.post(f"{API}/posts/{other['id']}/like", headers=author.headers).status_code == 200

    restricted = client.get(f"{API}/admin/restricted", headers=moderator.headers).json()
    assert [account["username"] for account in restricted] == ["layla"]

    lifted = client.post(f"{API}/admin/users/{author.id}/lift", headers=moderator.headers)
    assert lifted.status_code == 200
    assert client.post(f"{API}/posts", json={"content_html": "<p>back</p>"}, headers=author.headers).status_code == 201

    # A restriction simply runs out.
    db.execute(update(User).where(User.id == author.id).values(restricted_until=utcnow() - timedelta(minutes=1)))
    db.commit()
    assert client.get(f"{API}/users/me", headers=author.headers).json()["restricted_until"] is None


def test_suspending_signs_the_author_out_and_hides_their_posts(client, make_user, make_post, moderator):
    author = make_user("layla")
    reporter = make_user("omar")
    post = make_post(author, title="Scam")
    make_post(author, title="Another")
    report(client, reporter, post["id"], reason="spam")
    case_id = client.get(f"{API}/admin/reports", headers=moderator.headers).json()["items"][0]["case_id"]

    decision = {"author_action": "suspend", "note": "Repeated scams."}
    decided = client.post(f"{API}/admin/reports/{case_id}/decision", json=decision, headers=moderator.headers)
    assert decided.json()["actions"] == ["author_suspended"]

    assert client.get(f"{API}/users/me", headers=author.headers).status_code == 401
    login = client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": PASSWORD})
    assert login.status_code in (401, 403)
    assert client.get(f"{API}/posts", params={"tab": "latest"}).json()["total"] == 0
    assert client.get(f"{API}/posts/{post['id']}").status_code == 404
    # Moderators can still open the evidence.
    assert client.get(f"{API}/posts/{post['id']}", headers=moderator.headers).status_code == 200

    suspended = client.get(f"{API}/admin/restricted", headers=moderator.headers).json()
    assert suspended[0]["suspended"] is True
    client.post(f"{API}/admin/users/{author.id}/lift", headers=moderator.headers)
    assert client.post(f"{API}/auth/login", json={"email": "layla@example.com", "password": PASSWORD}).status_code == 200


def test_moderators_cannot_be_restricted(client, make_user, make_post, moderator, monkeypatch):
    monkeypatch.setattr(settings, "admin_usernames", ["modteam", "second"])
    second = make_user("second")
    post = make_post(second)
    report(client, make_user("omar"), post["id"])
    case_id = client.get(f"{API}/admin/reports", headers=moderator.headers).json()["items"][0]["case_id"]
    refused = client.post(
        f"{API}/admin/reports/{case_id}/decision", json={"author_action": "suspend"}, headers=moderator.headers
    )
    assert refused.json()["code"] == "cannot_moderate_admin"


def test_old_decided_reports_are_deleted(client, make_user, make_post, moderator, db):
    post = make_post(make_user("layla"))
    report(client, make_user("omar"), post["id"])
    case_id = client.get(f"{API}/admin/reports", headers=moderator.headers).json()["items"][0]["case_id"]
    client.post(f"{API}/admin/reports/{case_id}/decision", json={}, headers=moderator.headers)

    assert report_service.purge_resolved(db) == 0
    db.execute(update(Report).values(resolved_at=utcnow() - timedelta(days=settings.report_retention_days + 1)))
    db.commit()
    assert report_service.purge_resolved(db) == 1


# ------------------------------------------------------------------ ranking


def _age(db, post_id: int, **delta) -> None:
    db.execute(update(Post).where(Post.id == post_id).values(created_at=utcnow() - timedelta(**delta)))
    db.commit()


def test_trending_rewards_speed_not_just_totals(client, make_user, make_post, db):
    author = make_user("layla")
    fans = [make_user(f"fan{i}") for i in range(4)]
    old = make_post(author, title="Old favourite")
    fresh = make_post(author, title="Fresh")
    for fan in fans:
        client.post(f"{API}/posts/{old['id']}/like", headers=fan.headers)
    for fan in fans[:2]:
        client.post(f"{API}/posts/{fresh['id']}/like", headers=fan.headers)
    _age(db, old["id"], days=5)

    titles = [item["title"] for item in client.get(f"{API}/posts/trending").json()["items"]]
    assert titles == ["Fresh", "Old favourite"]


def test_for_you_mixes_authors(client, make_user, make_post):
    viewer = make_user("viewer")
    prolific = make_user("prolific")
    others = [make_user(f"other{i}") for i in range(3)]
    client.post(f"{API}/users/{prolific.id}/follow", headers=viewer.headers)
    for account in others:
        make_post(account, title=f"From {account.username}")
    for i in range(5):
        make_post(prolific, title=f"Prolific {i}")

    feed = client.get(f"{API}/posts", params={"tab": "for_you"}, headers=viewer.headers).json()
    authors = [item["author"]["username"] for item in feed["items"]]
    assert feed["total"] == 8
    # Followed posts lead, but the first five never hold more than two from the same person;
    # the rest only bunch up at the end, when nobody else is left.
    assert authors[0] == "prolific"
    assert authors[:5].count("prolific") == 2


def test_for_you_learns_from_what_you_like(client, make_user, make_post, db):
    viewer = make_user("viewer")
    liked_author = make_user("liked")
    stranger = make_user("stranger")
    earlier = make_post(liked_author, title="Earlier by liked")
    client.post(f"{API}/posts/{earlier['id']}/like", headers=viewer.headers)
    _age(db, earlier["id"], days=10)
    make_post(liked_author, title="New by liked")
    make_post(stranger, title="New by stranger")

    titles = [item["title"] for item in client.get(f"{API}/posts", params={"tab": "for_you"}, headers=viewer.headers).json()["items"]]
    assert titles.index("New by liked") < titles.index("New by stranger")


def test_the_data_download_lists_reports_sent_but_not_who_reported_you(client, make_user, make_post):
    author = make_user("layla")
    reporter = make_user("omar")
    post = make_post(author, title="Reported")
    report(client, reporter, post["id"], reason="spam", details="Links to a shop")

    mine = client.get(f"{API}/users/me/export", headers=reporter.headers).json()
    assert mine["reports_sent"][0]["reason"] == "spam"
    assert mine["reports_sent"][0]["details"] == "Links to a shop"
    theirs = client.get(f"{API}/users/me/export", headers=author.headers).json()
    assert theirs["reports_sent"] == []
    assert "omar" not in str(theirs)
