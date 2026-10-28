"""Opt-in weekly reading list. Claim before sending; never duplicate an uncertain delivery."""

from datetime import timedelta
from html import escape
from time import monotonic
from urllib.parse import quote

import jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BadRequest
from app.models import DigestDelivery, User, UserSettings
from app.services import community_service, email_service
from app.utils.pagination import PageParams
from app.utils.time import utcnow


def unsubscribe_token(user: User) -> str:
    return jwt.encode(
        {"sub": str(user.id), "purpose": "weekly_digest", "email": user.email, "exp": utcnow() + timedelta(days=90)},
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def unsubscribe(db: Session, token: str) -> None:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        if data.get("purpose") != "weekly_digest":
            raise ValueError
        user = db.get(User, int(data["sub"]))
        if not user or data.get("email") != user.email:
            raise ValueError
    except (jwt.PyJWTError, ValueError, KeyError):
        raise BadRequest("Invalid or expired unsubscribe link", "digest_link_invalid") from None
    preferences = db.get(UserSettings, user.id)
    preferences.email_weekly_digest = False
    db.commit()


def deliver_weekly(db: Session, *, limit: int = 5, time_budget: float = 10) -> dict:
    if not settings.weekly_digest_enabled or not settings.smtp_configured:
        return {"enabled": False, "sent": 0}
    deadline = monotonic() + time_budget
    now = utcnow()
    week = (now - timedelta(days=now.weekday())).date().isoformat()
    claimed = select(DigestDelivery.user_id).where(DigestDelivery.week == week)
    recipients = list(
        db.scalars(
            select(User)
            .join(UserSettings)
            .where(
                User.is_active.is_(True),
                User.email_verified_at.is_not(None),
                UserSettings.email_weekly_digest.is_(True),
                User.id.not_in(claimed),
            )
            .order_by(User.id)
            .limit(limit)
        )
    )
    sent = processed = 0
    for user in recipients:
        # Leave room for cleanup/response on short-lived hosts. An in-flight SMTP
        # operation still obeys its own timeout, so large lists need a worker.
        if monotonic() >= deadline:
            break
        posts = community_service.browse(db, user, PageParams(page=1, limit=5), sort="trending", days=7).items
        delivery = DigestDelivery(user_id=user.id, week=week, status="pending")
        db.add(delivery)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        processed += 1
        if not posts:
            delivery.status = "empty"
            db.commit()
            continue
        language = db.get(UserSettings, user.id).language
        title = "قراءتك الأسبوعية من ArabDev" if language == "ar" else "Your weekly ArabDev reading list"
        url = settings.frontend_url.rstrip("/")
        unsubscribe_url = f"{url}{settings.api_v1_prefix}/digest/unsubscribe?token={quote(unsubscribe_token(user))}"
        lines = [f"{post.title or post.excerpt[:80]}\n{url}/posts/{post.id}" for post in posts]
        body = title + "\n\n" + "\n\n".join(lines) + "\n\nUnsubscribe / إلغاء الاشتراك: " + unsubscribe_url
        links = "".join(f'<li><a href="{url}/posts/{p.id}">{escape(p.title or p.excerpt[:80])}</a></li>' for p in posts)
        direction = "rtl" if language == "ar" else "ltr"
        html = (
            f'<html lang="{language}" dir="{direction}"><body><h1>{title}</h1><ul>{links}</ul>'
            f'<a href="{escape(unsubscribe_url)}">Unsubscribe / إلغاء الاشتراك</a></body></html>'
        )
        try:
            delivered = email_service.send(
                email_service.OutgoingEmail(to=user.email, subject=title, body=body, html=html)
            )
        except Exception:  # delivery may have succeeded remotely; do not retry automatically
            delivered = False
        delivery.status = "sent" if delivered else "failed"
        delivery.error = None if delivered else "Delivery failed or uncertain; manual review required"
        db.commit()
        sent += int(delivered)
    return {"enabled": True, "sent": sent, "processed": processed}
