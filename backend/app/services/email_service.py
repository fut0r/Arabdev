"""Outgoing email.

Messages are sent over SMTP when SMTP_HOST is configured, and logged otherwise, so local
development and the test suite need no mail provider. Everything is written in both
Arabic and English, in the reader's own language first.

Sending happens on the request thread with a short timeout: a code the visitor is waiting
for is worth the delay, and a failure has to be reported rather than silently dropped.
"""

import logging
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

from app.core.config import settings
from app.core.errors import ServiceUnavailable

logger = logging.getLogger("arabdev.email")

Language = str


@dataclass
class OutgoingEmail:
    to: str
    subject: str
    body: str
    html: str | None = None
    sender: str = field(default_factory=lambda: settings.mail_from)
    reply_to: str = field(default_factory=lambda: settings.support_email)


# Recent messages, kept outside production so tests (and a developer reading the log) can
# see exactly what would have been sent.
outbox: list[OutgoingEmail] = []


class MailNotSent(ServiceUnavailable):
    code = "mail_failed"


def _build(message: OutgoingEmail) -> EmailMessage:
    mail = EmailMessage()
    name, address = parseaddr(message.sender)
    mail["From"] = formataddr((name, address)) if name else address
    mail["To"] = message.to
    mail["Subject"] = message.subject
    mail["Reply-To"] = message.reply_to
    mail["Auto-Submitted"] = "auto-generated"
    mail.set_content(message.body)
    if message.html:
        mail.add_alternative(message.html, subtype="html")
    return mail


def _deliver(message: OutgoingEmail) -> None:
    host, port = settings.smtp_host or "", settings.smtp_port
    context = ssl.create_default_context()
    if settings.smtp_ssl:
        server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=settings.smtp_timeout_seconds, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=settings.smtp_timeout_seconds)
    with server:
        server.ehlo()
        if settings.smtp_starttls and not settings.smtp_ssl:
            server.starttls(context=context)
            server.ehlo()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(_build(message))


def send(message: OutgoingEmail, *, required: bool = False) -> bool:
    """Send one message. Returns whether it left the building.

    With `required`, a failure raises: the caller is about to tell someone to check their
    inbox, and that would be a lie.
    """
    if settings.environment != "production":
        outbox.append(message)
        del outbox[:-50]
    if not settings.smtp_configured:
        logger.warning(
            "EMAIL (not sent: no SMTP host) to=%s subject=%r\n%s", message.to, message.subject, message.body
        )
        if required and settings.environment == "production":
            raise MailNotSent("We can't send email right now. Please try again later.", "mail_unavailable")
        return False
    try:
        _deliver(message)
    except (smtplib.SMTPException, OSError, ssl.SSLError):
        logger.exception("Sending mail to %s failed", message.to)
        if required:
            raise MailNotSent("We couldn't send that email. Please try again in a moment.", "mail_failed") from None
        return False
    logger.info("Sent %r to %s", message.subject, message.to)
    return True


# --------------------------------------------------------------------------- templates

_BRAND = "#c8102e"


def _layout(language: Language, title: str, lines: list[str], *, code: str | None = None, footer: str) -> str:
    """One small, self-contained HTML shell. No images, no tracking, no external CSS."""
    rtl = language == "ar"
    direction = "rtl" if rtl else "ltr"
    align = "right" if rtl else "left"
    font = "'Tajawal', 'Segoe UI', Arial, sans-serif"
    paragraphs = "".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#3f3f46">{line}</p>' for line in lines
    )
    code_block = (
        f'<p style="margin:24px 0;text-align:center">'
        f'<span style="display:inline-block;padding:14px 28px;border-radius:12px;background:#f5f4f2;'
        f'border:1px solid #e7e5e1;font-family:Consolas,Menlo,monospace;font-size:30px;letter-spacing:10px;'
        f'font-weight:700;color:#141414;direction:ltr">{code}</span></p>'
        if code
        else ""
    )
    return (
        f'<!doctype html><html lang="{language}" dir="{direction}"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title></head>'
        f'<body style="margin:0;padding:24px;background:#f5f4f2;font-family:{font}">'
        f'<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e1;'
        f'border-radius:16px;padding:28px;text-align:{align}">'
        f'<p style="margin:0 0 20px;font-size:22px;font-weight:800;letter-spacing:0.5px;direction:ltr;'
        f'text-align:{align}"><span style="color:{_BRAND}">Arab</span><span style="color:#141414">Dev</span></p>'
        f'<h1 style="margin:0 0 16px;font-size:19px;line-height:1.5;color:#141414">{title}</h1>'
        f"{paragraphs}{code_block}"
        f'<hr style="border:0;border-top:1px solid #e7e5e1;margin:24px 0">'
        f'<p style="margin:0;font-size:13px;line-height:1.7;color:#86847f">{footer}</p>'
        f"</div></body></html>"
    )


def _plain(title: str, lines: list[str], footer: str, code: str | None = None) -> str:
    parts = [title, ""]
    parts.extend(lines)
    if code:
        parts.extend(["", code, ""])
    parts.extend(["", footer])
    return "\n".join(parts)


def _footer(language: Language) -> str:
    site = settings.frontend_url.rstrip("/")
    if language == "ar":
        return (
            f"أرسلت هذه الرسالة تلقائيًا من {site}. لن يطلب منك فريق ArabDev كلمة المرور أو رمز التحقق أبدًا. "
            f"للمساعدة راسلنا على {settings.support_email}."
        )
    return (
        f"This message was sent automatically from {site}. ArabDev will never ask you for your password "
        f"or a verification code. Need help? Write to {settings.support_email}."
    )


# --------------------------------------------------------------------------- six-digit codes

_CODE_COPY: dict[str, dict[Language, dict[str, object]]] = {
    "register": {
        "ar": {
            "subject": "رمز تأكيد حسابك في ArabDev",
            "title": "أكّد بريدك الإلكتروني",
            "lines": [
                "أهلًا بك في ArabDev. استخدم هذا الرمز لإكمال إنشاء حسابك:",
                "الرمز صالح لمدة {minutes} دقائق ويُستخدم مرة واحدة.",
                "إن لم تكن أنت من طلب إنشاء الحساب، تجاهل هذه الرسالة ولن يُنشأ أي حساب.",
            ],
        },
        "en": {
            "subject": "Your ArabDev sign-up code",
            "title": "Confirm your email address",
            "lines": [
                "Welcome to ArabDev. Use this code to finish creating your account:",
                "The code is valid for {minutes} minutes and can be used once.",
                "If you didn't ask to create an account, ignore this email and no account will be created.",
            ],
        },
    },
    "login": {
        "ar": {
            "subject": "رمز تسجيل الدخول إلى ArabDev",
            "title": "رمز تسجيل الدخول",
            "lines": [
                "استخدم هذا الرمز لإكمال تسجيل الدخول إلى حسابك:",
                "الرمز صالح لمدة {minutes} دقائق ويُستخدم مرة واحدة.",
                "إن لم تحاول تسجيل الدخول، غيّر كلمة المرور فورًا؛ شخص ما يعرفها.",
            ],
        },
        "en": {
            "subject": "Your ArabDev sign-in code",
            "title": "Sign-in code",
            "lines": [
                "Use this code to finish signing in to your account:",
                "The code is valid for {minutes} minutes and can be used once.",
                "If you weren't signing in, change your password now: somebody else knows it.",
            ],
        },
    },
    "email_change": {
        "ar": {
            "subject": "رمز تغيير بريدك في ArabDev",
            "title": "أكّد بريدك الجديد",
            "lines": [
                "طُلب ربط هذا البريد بحسابك في ArabDev. استخدم هذا الرمز لتأكيده:",
                "الرمز صالح لمدة {minutes} دقائق ويُستخدم مرة واحدة.",
                "لن يتغيّر بريد الحساب قبل إدخال الرمز.",
            ],
        },
        "en": {
            "subject": "Your ArabDev email change code",
            "title": "Confirm your new email address",
            "lines": [
                "Someone asked to move an ArabDev account to this address. Use this code to confirm it:",
                "The code is valid for {minutes} minutes and can be used once.",
                "The account's email will not change until the code is entered.",
            ],
        },
    },
    "password_change": {
        "ar": {
            "subject": "رمز تغيير كلمة المرور في ArabDev",
            "title": "أكّد تغيير كلمة المرور",
            "lines": [
                "طُلب تغيير كلمة مرور حسابك. استخدم هذا الرمز لتأكيد التغيير:",
                "الرمز صالح لمدة {minutes} دقائق ويُستخدم مرة واحدة.",
                "إن لم تطلب ذلك، تجاهل الرسالة ولن تتغيّر كلمة المرور.",
            ],
        },
        "en": {
            "subject": "Your ArabDev password change code",
            "title": "Confirm your new password",
            "lines": [
                "Someone asked to change the password on your account. Use this code to confirm it:",
                "The code is valid for {minutes} minutes and can be used once.",
                "If this wasn't you, ignore this email and your password stays as it is.",
            ],
        },
    },
}


def send_verification_code(email: str, code: str, purpose: str, language: Language = "ar") -> None:
    copy = _CODE_COPY[purpose].get(language) or _CODE_COPY[purpose]["en"]
    minutes = settings.verification_code_ttl_minutes
    lines = [str(line).format(minutes=minutes) for line in copy["lines"]]  # type: ignore[union-attr]
    title, subject = str(copy["title"]), str(copy["subject"])
    footer = _footer(language)
    send(
        OutgoingEmail(
            to=email,
            subject=f"{code} — {subject}",
            body=_plain(title, lines, footer, code),
            html=_layout(language, title, lines, code=code, footer=footer),
        ),
        required=True,
    )


# --------------------------------------------------------------------------- notices


def send_password_reset(email: str, token: str, language: Language = "ar") -> None:
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    minutes = settings.password_reset_expire_minutes
    if language == "ar":
        title = "إعادة تعيين كلمة المرور"
        lines = [
            "طلب أحدهم إعادة تعيين كلمة مرور حسابك في ArabDev.",
            f'افتح هذا الرابط خلال {minutes} دقيقة لاختيار كلمة مرور جديدة:<br><a href="{link}" '
            f'style="color:{_BRAND}">{link}</a>',
            "إن لم تطلب ذلك، تجاهل الرسالة؛ كلمة مرورك لم تتغيّر.",
        ]
        subject = "إعادة تعيين كلمة مرور ArabDev"
    else:
        title = "Reset your password"
        lines = [
            "Someone asked to reset the password for your ArabDev account.",
            f'Open this link within {minutes} minutes to choose a new one:<br>'
            f'<a href="{link}" style="color:{_BRAND}">{link}</a>',
            "If this wasn't you, ignore this email; your password has not changed.",
        ]
        subject = "Reset your ArabDev password"
    footer = _footer(language)
    plain_lines = [line.replace(f'<br><a href="{link}" style="color:{_BRAND}">{link}</a>', f"\n{link}") for line in lines]
    send(
        OutgoingEmail(
            to=email,
            subject=subject,
            body=_plain(title, plain_lines, footer),
            html=_layout(language, title, lines, footer=footer),
        )
    )


_ALERT_COPY: dict[str, dict[Language, dict[str, str]]] = {
    "password_changed": {
        "ar": {
            "subject": "تم تغيير كلمة مرور حسابك",
            "title": "تم تغيير كلمة المرور",
            "line": "غُيّرت كلمة مرور حسابك للتو، وأُنهيت كل الجلسات الأخرى.",
        },
        "en": {
            "subject": "Your ArabDev password was changed",
            "title": "Password changed",
            "line": "The password on your account was just changed, and every other session was signed out.",
        },
    },
    "email_changed": {
        "ar": {
            "subject": "تم تغيير بريد حسابك",
            "title": "تم تغيير البريد الإلكتروني",
            "line": "لم يعد هذا العنوان مرتبطًا بحسابك في ArabDev؛ صار الدخول عبر العنوان الجديد.",
        },
        "en": {
            "subject": "Your ArabDev email was changed",
            "title": "Email address changed",
            "line": "This address is no longer attached to your ArabDev account; sign in with the new one.",
        },
    },
    "new_sign_in": {
        "ar": {
            "subject": "تسجيل دخول جديد إلى حسابك",
            "title": "تسجيل دخول جديد",
            "line": "سُجّل دخول إلى حسابك للتو.",
        },
        "en": {
            "subject": "New sign-in to your ArabDev account",
            "title": "New sign-in",
            "line": "Your account was just signed in to.",
        },
    },
}


def send_security_alert(email: str, kind: str, language: Language = "ar", detail: str | None = None) -> None:
    """Tell someone their account changed. Best effort: never blocks the change itself."""
    copy = _ALERT_COPY[kind].get(language) or _ALERT_COPY[kind]["en"]
    closing = (
        f"إن لم تكن أنت، راسلنا فورًا على {settings.support_email}."
        if language == "ar"
        else f"If this wasn't you, write to {settings.support_email} straight away."
    )
    lines = [copy["line"]] + ([detail] if detail else []) + [closing]
    footer = _footer(language)
    send(
        OutgoingEmail(
            to=email,
            subject=copy["subject"],
            body=_plain(copy["title"], lines, footer),
            html=_layout(language, copy["title"], lines, footer=footer),
        )
    )
