"""Rules that make ArabDev a poor target for spam bots, without getting in people's way.

Turnstile and the human pass (services/human_check.py) prove a real browser is present. These
rules limit what an account can do with one, because most spam comes from accounts made minutes
before it is posted:

- During its first day an account can publish 5 posts and 20 comments an hour, and put at most
  2 links in a post, a comment or its bio, none of them straight to a program to download or to a
  bare IP address (the usual ways malware is passed around). After that the normal limits apply.
- One account can't post the same text twice within a day (copy-paste floods). Short comments
  such as "Thanks!" are exempt.
- Sign-ups and email changes to throwaway inboxes are refused, and a sign-up form that fills in
  the hidden "homepage" field (people never see it; form-filling bots do) is turned away.

Moderators are exempt from all of it.
"""

import logging
import re
from datetime import timedelta
from urllib.parse import urlsplit

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.errors import UnprocessableEntity
from app.core.permissions import is_admin
from app.core.rate_limit import limit_identifier
from app.models import Comment, Post, User
from app.utils.time import utcnow

logger = logging.getLogger("arabdev.spam")

NEW_ACCOUNT_AGE = timedelta(hours=24)
NEW_ACCOUNT_POSTS_PER_HOUR = 5
NEW_ACCOUNT_COMMENTS_PER_HOUR = 20
NEW_ACCOUNT_MAX_LINKS = 2
DUPLICATE_WINDOW = timedelta(hours=24)
# Comments shorter than this may repeat: "Thanks!" and "+1" are not spam.
DUPLICATE_MIN_COMMENT_LENGTH = 20

_HREF = re.compile(r'href="([^"]+)"', re.IGNORECASE)
_BARE_URL = re.compile(r"(?:https?://|www\.)[^\s<>\"']+", re.IGNORECASE)
_PROGRAM = re.compile(r"\.(?:apk|bat|cmd|dll|dmg|exe|jar|msi|pif|ps1|scr|vbs|wsf)$", re.IGNORECASE)
_IP_HOST = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")

# Services that hand out inboxes which vanish after minutes or hours. Subdomains count too.
DISPOSABLE_DOMAINS = frozenset(
    {
        "10minutemail.com", "10minutemail.net", "1secmail.com", "1secmail.net", "1secmail.org",
        "20minutemail.com", "anonbox.net", "armyspy.com", "burnermail.io", "crazymailing.com",
        "cuvox.de", "dayrep.com", "discard.email", "discardmail.com", "dispostable.com",
        "einrot.com", "emailfake.com", "emailondeck.com", "emlpro.com", "emltmp.com",
        "fakeinbox.com", "fakemail.net", "fakemailgenerator.com", "fleckens.hu", "getnada.com",
        "grr.la", "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de", "guerrillamail.info",
        "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "gustr.com",
        "harakirimail.com", "inboxkitten.com", "jourrapide.com", "linshiyouxiang.net", "luxusmail.org",
        "mail.gw", "mail.tm", "mailcatch.com", "maildrop.cc", "mailforspam.com", "mailinator.com",
        "mailinator.net", "mailinator2.com", "mailnesia.com", "mailnull.com", "mailpoof.com",
        "minuteinbox.com", "mintemail.com", "moakt.com", "mohmal.com", "mvrht.com", "mytemp.email",
        "nada.email", "owlymail.com", "pokemail.net", "rhyta.com", "sharklasers.com", "smailpro.com",
        "spam4.me", "spambox.us", "spamex.com", "spamgourmet.com", "superrito.com", "teleworm.us",
        "temp-mail.io", "temp-mail.org", "tempail.com", "tempemail.co", "tempinbox.com",
        "tempmail.com", "tempmail.dev", "tempmail.net", "tempmail.plus", "tempmailaddress.com",
        "tempmailo.com", "tempr.email", "throwawaymail.com", "tmail.ws", "tmpmail.net",
        "tmpmail.org", "trashmail.com", "trashmail.de", "trashmail.net", "yopmail.com",
        "yopmail.fr", "yopmail.net",
    }
)  # fmt: skip


def is_new_account(user: User) -> bool:
    return not is_admin(user) and user.created_at > utcnow() - NEW_ACCOUNT_AGE


def links_in(*, html: str = "", text: str = "", extra: tuple[str, ...] = ()) -> set[str]:
    """Distinct addresses in a piece of content: linked ones, typed-out ones, and any extra ones."""
    found = {match.rstrip(".,)") for match in _HREF.findall(html)}
    found |= {match.rstrip(".,)") for match in _BARE_URL.findall(text)}
    return found | {url for url in extra if url}


def is_risky(url: str) -> bool:
    parts = urlsplit(url if "://" in url else f"http://{url}")
    return bool(_PROGRAM.search(parts.path) or _IP_HOST.match(parts.hostname or ""))


def check_links(author: User, links: set[str], field: str) -> None:
    if not is_new_account(author):
        return
    if any(is_risky(url) for url in links):
        raise UnprocessableEntity(
            "New accounts can't link to programs to download or to bare IP addresses.", "risky_link", field=field
        )
    if len(links) > NEW_ACCOUNT_MAX_LINKS:
        raise UnprocessableEntity(
            f"New accounts can add up to {NEW_ACCOUNT_MAX_LINKS} links during their first day.",
            "too_many_links",
            field=field,
        )


def check_new_post(db: Session, author: User, *, html: str, text: str, link_url: str | None) -> None:
    if is_admin(author):
        return
    check_links(author, links_in(html=html, text=text, extra=(link_url or "",)), "content_html")
    duplicate = db.scalar(
        select(
            exists().where(
                Post.author_id == author.id,
                Post.content_text == text,
                Post.created_at > utcnow() - DUPLICATE_WINDOW,
            )
        )
    )
    if duplicate:
        raise UnprocessableEntity("You already posted this.", "duplicate_post", field="content_html")
    if is_new_account(author):
        limit_identifier("new_account_post", str(author.id), NEW_ACCOUNT_POSTS_PER_HOUR, 3600)


def check_new_comment(db: Session, author: User, content: str) -> None:
    if is_admin(author):
        return
    check_links(author, links_in(text=content), "content")
    if len(content) >= DUPLICATE_MIN_COMMENT_LENGTH:
        duplicate = db.scalar(
            select(
                exists().where(
                    Comment.author_id == author.id,
                    Comment.content == content,
                    Comment.created_at > utcnow() - DUPLICATE_WINDOW,
                )
            )
        )
        if duplicate:
            raise UnprocessableEntity("You already wrote this comment.", "duplicate_comment", field="content")
    if is_new_account(author):
        limit_identifier("new_account_comment", str(author.id), NEW_ACCOUNT_COMMENTS_PER_HOUR, 3600)


def is_disposable(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].strip().lower().rstrip(".")
    parts = domain.split(".")
    return any(".".join(parts[i:]) in DISPOSABLE_DOMAINS for i in range(len(parts) - 1))


def ensure_real_inbox(email: str) -> None:
    if is_disposable(email):
        raise UnprocessableEntity(
            "Use an email address you'll keep. Temporary inboxes can't be used.", "email_disposable", field="email"
        )


def ensure_no_honeypot(value: str | None, *, form: str) -> None:
    """The hidden field is empty for people. A value means a script filled in every field it found."""
    if value:
        logger.warning("Honeypot filled on the %s form; request refused", form)
        raise UnprocessableEntity("We couldn't complete this. Please try again.", "request_rejected")
