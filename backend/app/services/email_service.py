"""Outgoing email.

Messages are sent over SMTP when SMTP_HOST is configured, and logged otherwise, so local
development and the test suite need no mail provider. Everything is written in both
Arabic and English, in the reader's own language first.

Sending happens on the request thread with a short timeout: a code the visitor is waiting
for is worth the delay, and a failure has to be reported rather than silently dropped.
"""

import html
import logging
import re
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

# The site's own typefaces: Anton for the wordmark, Alexandria for headings, Tajawal for text.
# Mail apps that understand web fonts (Apple Mail, iOS, Outlook for Mac, Thunderbird) load them
# from arabdev.site itself, so no third party learns when an email is opened. Gmail and Outlook
# on Windows ignore web fonts; they fall back to the next font in each list, and the wordmark is
# an image so it looks the same everywhere.
_HEADING_FONT = "'Alexandria','Tajawal','Segoe UI',Tahoma,Arial,sans-serif"
_TEXT_FONT = "'Tajawal','Segoe UI',Tahoma,Arial,sans-serif"
_LOGO_WIDTH, _LOGO_HEIGHT = 102, 30


def _asset(path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}"


def _font_faces() -> str:
    faces = [
        ("Anton", 400, "/fonts/anton/anton-400.woff2"),
        ("Alexandria", 700, "/fonts/alexandria/alexandria-700.woff2"),
        ("Tajawal", 400, "/fonts/tajawal/tajawal-400.woff2"),
        ("Tajawal", 700, "/fonts/tajawal/tajawal-700.woff2"),
    ]
    return "".join(
        f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
        f"src:url('{_asset(path)}') format('woff2');}}"
        for family, weight, path in faces
    )


def _layout(
    language: Language,
    title: str,
    lines: list[str],
    *,
    code: str | None = None,
    footer: str,
    button: tuple[str, str] | None = None,
) -> str:
    """One small HTML shell for every email: the wordmark, a heading, text, an optional code
    or button, and the footer. No tracking pixels and no third-party resources."""
    rtl = language == "ar"
    direction = "rtl" if rtl else "ltr"
    align = "right" if rtl else "left"
    paragraphs = "".join(
        f'<p style="margin:0 0 14px;font-family:{_TEXT_FONT};font-size:15px;line-height:1.8;color:#3f3f46">'
        f"{line}</p>"
        for line in lines
    )
    code_block = (
        f'<p style="margin:24px 0;text-align:center">'
        f'<span style="display:inline-block;padding:14px 28px;border-radius:12px;background:#f5f4f2;'
        f'border:1px solid #e7e5e1;font-family:Consolas,Menlo,monospace;font-size:30px;letter-spacing:10px;'
        f'font-weight:700;color:#141414;direction:ltr">{code}</span></p>'
        if code
        else ""
    )
    button_block = (
        f'<p style="margin:22px 0 6px;text-align:{align}">'
        f'<a href="{button[1]}" style="display:inline-block;padding:11px 22px;border-radius:10px;'
        f"background:{_BRAND};color:#ffffff;text-decoration:none;font-family:{_HEADING_FONT};"
        f'font-size:14px;font-weight:700">{button[0]}</a></p>'
        if button
        else ""
    )
    logo = (
        f'<img src="{_asset("/email/logo.png")}" width="{_LOGO_WIDTH}" height="{_LOGO_HEIGHT}" alt="ArabDev" '
        f'style="display:block;border:0;outline:none;width:{_LOGO_WIDTH}px;height:{_LOGO_HEIGHT}px;'
        f"font-family:'Anton',Impact,'Arial Narrow',sans-serif;font-size:24px;color:{_BRAND}\">"
    )
    return (
        f'<!doctype html><html lang="{language}" dir="{direction}"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">'
        f"<title>{title}</title><style>{_font_faces()}</style></head>"
        f'<body style="margin:0;padding:24px;background:#f5f4f2;font-family:{_TEXT_FONT}">'
        f'<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e1;'
        f'border-radius:16px;padding:28px;text-align:{align}">'
        f'<div dir="ltr" style="margin:0 0 22px;text-align:{align}">'
        f'<span style="display:inline-block">{logo}</span></div>'
        f'<h1 style="margin:0 0 16px;font-family:{_HEADING_FONT};font-size:20px;font-weight:700;line-height:1.5;'
        f'color:#141414">{title}</h1>'
        f"{paragraphs}{code_block}{button_block}"
        f'<hr style="border:0;border-top:1px solid #e7e5e1;margin:24px 0">'
        f'<p style="margin:0;font-family:{_TEXT_FONT};font-size:13px;line-height:1.7;color:#86847f">{footer}</p>'
        f"</div></body></html>"
    )


def _plain(title: str, lines: list[str], footer: str, code: str | None = None, link: str | None = None) -> str:
    parts = [title, ""]
    parts.extend(re.sub(r"<[^>]+>", "", line) for line in lines)
    if code:
        parts.extend(["", code, ""])
    if link:
        parts.extend(["", link])
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


# --------------------------------------------------------------------------- reports

REASON_LABELS: dict[str, dict[Language, str]] = {
    "spam": {"en": "Spam or advertising", "ar": "رسائل مزعجة أو إعلان"},
    "harassment": {"en": "Harassment or bullying", "ar": "تحرّش أو تنمّر"},
    "hate": {"en": "Hate speech", "ar": "خطاب كراهية"},
    "sexual": {"en": "Sexual content", "ar": "محتوى جنسي"},
    "violence": {"en": "Violence or threats", "ar": "عنف أو تهديد"},
    "misinformation": {"en": "False or misleading information", "ar": "معلومات كاذبة أو مضللة"},
    "personal_info": {"en": "Someone's private information", "ar": "معلومات شخصية لأحد الأشخاص"},
    "copyright": {"en": "Copyright infringement", "ar": "انتهاك حقوق النشر"},
    "other": {"en": "Something else", "ar": "سبب آخر"},
}


def reason_label(reason: str, language: Language) -> str:
    labels = REASON_LABELS.get(reason, REASON_LABELS["other"])
    return labels.get(language) or labels["en"]


def _quoted(text: str | None, fallback: str) -> str:
    """User-written text, escaped so it can never turn into markup or a link in the email."""
    return f"«{html.escape(text)}»" if text else fallback


def _post_url(post_id: int | None) -> str | None:
    return f"{settings.frontend_url.rstrip('/')}/posts/{post_id}" if post_id else None


def _guidelines_url(language: Language) -> str:
    return f"https://wiki.arabdev.site/{'ar' if language == 'ar' else 'en'}/#community-guidelines"


def _send_notice(
    to: str,
    language: Language,
    subject: str,
    title: str,
    lines: list[str],
    button: tuple[str, str] | None = None,
) -> None:
    footer = _footer(language)
    send(
        OutgoingEmail(
            to=to,
            subject=subject,
            body=_plain(title, lines, footer, link=button[1] if button else None),
            html=_layout(language, title, lines, footer=footer, button=button),
        )
    )


def send_report_received(
    to: str, language: Language, post_title: str | None, reason: str, *, hidden: bool
) -> None:
    """Tells an author their post was reported. Never says who reported it."""
    ar = language == "ar"
    name = _quoted(post_title, "منشورك" if ar else "your post")
    label = reason_label(reason, language)
    if ar:
        title = "أُبلغ عن أحد منشوراتك"
        lines = [
            f"أبلغ أحد أعضاء المجتمع عن {name} بسبب: <strong>{label}</strong>.",
            "سيراجع فريق ArabDev المنشور خلال أيام قليلة ويخبرك بالنتيجة بالبريد. لا تحتاج إلى فعل أي شيء الآن.",
            "لا نخبر أحدًا أبدًا بهوية من أبلغ، ولا يعرف المبلِّغ عن حسابك شيئًا سوى النتيجة.",
        ]
        if hidden:
            lines.insert(1, "وصلت بلاغات كافية لإخفاء المنشور مؤقتًا عن الآخرين حتى تنتهي المراجعة، وما زلت تستطيع رؤيته.")
        subject = "أُبلغ عن أحد منشوراتك في ArabDev"
        button = ("اقرأ إرشادات المجتمع", _guidelines_url(language))
    else:
        title = "One of your posts was reported"
        lines = [
            f"A member of the community reported {name} for: <strong>{label}</strong>.",
            "The ArabDev team will review it within a few days and email you the outcome. You don't need to do anything now.",
            "We never tell anyone who made a report, and the person who reported only hears the outcome.",
        ]
        if hidden:
            lines.insert(1, "Enough reports have come in that the post is hidden from others until the review is done. You can still see it.")
        subject = "One of your ArabDev posts was reported"
        button = ("Read the community guidelines", _guidelines_url(language))
    _send_notice(to, language, subject, title, lines, button)


def send_post_hidden(to: str, language: Language, post_title: str | None) -> None:
    """Sent when a post that was already reported crosses the hiding threshold."""
    ar = language == "ar"
    name = _quoted(post_title, "منشورك" if ar else "your post")
    if ar:
        title = "أُخفي منشورك مؤقتًا"
        lines = [
            f"وصلت عدة بلاغات عن {name}، فأُخفي عن الآخرين حتى يراجعه فريق ArabDev. ما زلت تستطيع رؤيته.",
            "سنخبرك بالقرار بالبريد، وإن لم نجد فيه مخالفة يعود ظاهرًا للجميع.",
        ]
        subject = "أُخفي أحد منشوراتك مؤقتًا في ArabDev"
    else:
        title = "Your post is hidden for now"
        lines = [
            f"Several people reported {name}, so it is hidden from others until the ArabDev team reviews it. You can still see it.",
            "We'll email you the decision. If nothing is wrong with it, everyone will see it again.",
        ]
        subject = "One of your ArabDev posts is hidden for now"
    _send_notice(to, language, subject, title, lines)


def send_report_to_moderators(
    *,
    report_id: int,
    post_id: int,
    post_title: str | None,
    post_excerpt: str,
    reason: str,
    details: str | None,
    reporter: str,
    author: str,
    open_reports: int,
    hidden: bool,
) -> None:
    """The moderators' copy of a new report, in both languages, with a link to decide."""
    to = settings.moderation_email or settings.support_email
    review = f"{settings.frontend_url.rstrip('/')}/admin/reports?report={report_id}"
    status_en = "hidden until reviewed" if hidden else "still visible"
    status_ar = "مخفي حتى المراجعة" if hidden else "ما زال ظاهرًا"
    post_url = _post_url(post_id)
    lines = [
        f"<strong>Reason / السبب:</strong> {reason_label(reason, 'en')} — {reason_label(reason, 'ar')}",
        f"<strong>Details / التفاصيل:</strong> {_quoted(details, '—')}",
        f"<strong>Post / المنشور:</strong> {_quoted(post_title, '(untitled / بلا عنوان)')} — {html.escape(post_excerpt)}",
        f"<strong>Author / الكاتب:</strong> @{html.escape(author)} · "
        f"<strong>Reported by / المبلِّغ:</strong> @{html.escape(reporter)}",
        f"<strong>Open reports on this post / البلاغات المفتوحة:</strong> {open_reports} ({status_en} / {status_ar})",
        f'<a href="{post_url}">{post_url}</a>',
    ]
    _send_notice(
        to,
        "en",
        f"[Report #{report_id}] {reason_label(reason, 'en')} — @{author}",
        "New report / بلاغ جديد",
        lines,
        ("Review the report / راجع البلاغ", review),
    )


def send_decision_to_author(
    to: str,
    language: Language,
    post_title: str | None,
    *,
    removed: bool,
    restricted_until: str | None,
    suspended: bool,
    note: str | None,
) -> None:
    ar = language == "ar"
    name = _quoted(post_title, "منشورك" if ar else "your post")
    acted = removed or bool(restricted_until) or suspended
    lines: list[str] = []
    if ar:
        if not acted:
            title = "راجعنا البلاغ عن منشورك"
            lines.append(f"راجع فريق ArabDev {name} ولم يجد فيه ما يخالف إرشادات المجتمع، فلن يتغيّر شيء. وإن كان مخفيًا فقد عاد ظاهرًا للجميع.")
        else:
            title = "قرار الفريق بشأن منشورك"
            if removed:
                lines.append(f"بعد المراجعة حذف فريق ArabDev {name} لأنه يخالف إرشادات المجتمع.")
            if restricted_until:
                lines.append(f"لن يتمكن حسابك من النشر أو التعليق أو إعادة النشر حتى <strong>{restricted_until}</strong>. وما زلت تستطيع القراءة وتسجيل الدخول.")
            if suspended:
                lines.append("أُوقف حسابك، فلم يعد بإمكانك تسجيل الدخول، ولم تعد منشوراتك ظاهرة.")
        if note:
            lines.append(f"<strong>ملاحظة الفريق:</strong> {html.escape(note)}")
        lines.append(f"إن رأيت أن القرار خاطئ فراسلنا على {settings.support_email} وسنراجعه مجددًا.")
        subject = "نتيجة مراجعة البلاغ في ArabDev"
        button = ("إرشادات المجتمع", _guidelines_url(language))
    else:
        if not acted:
            title = "We reviewed the report about your post"
            lines.append(f"The ArabDev team reviewed {name} and found nothing against the community guidelines, so nothing changes. If it was hidden, everyone can see it again.")
        else:
            title = "The team's decision about your post"
            if removed:
                lines.append(f"After review, the ArabDev team removed {name} because it breaks the community guidelines.")
            if restricted_until:
                lines.append(f"Your account can't post, comment or repost until <strong>{restricted_until}</strong>. You can still read and sign in.")
            if suspended:
                lines.append("Your account has been suspended: you can no longer sign in, and your posts are no longer shown.")
        if note:
            lines.append(f"<strong>Note from the team:</strong> {html.escape(note)}")
        lines.append(f"If you think this is a mistake, write to {settings.support_email} and we will look at it again.")
        subject = "The outcome of the report on ArabDev"
        button = ("Community guidelines", _guidelines_url(language))
    _send_notice(to, language, subject, title, lines, button)


def send_decision_to_reporter(to: str, language: Language, post_title: str | None, *, action_taken: bool) -> None:
    ar = language == "ar"
    name = _quoted(post_title, "المنشور الذي أبلغت عنه" if ar else "the post you reported")
    if ar:
        title = "شكرًا على بلاغك"
        outcome = (
            "واتخذ إجراءً بحق المنشور أو كاتبه وفق إرشادات المجتمع."
            if action_taken
            else "ولم يجد فيه ما يخالف إرشادات المجتمع، فبقي كما هو."
        )
        lines = [f"راجع فريق ArabDev {name} {outcome}", "لم نخبر الكاتب بهويتك، وبلاغاتك تساعد في إبقاء المجتمع آمنًا."]
        subject = "راجعنا بلاغك في ArabDev"
    else:
        title = "Thanks for your report"
        outcome = (
            "and took action on the post or its author under the community guidelines."
            if action_taken
            else "and found nothing against the community guidelines, so it stays up."
        )
        lines = [f"The ArabDev team reviewed {name} {outcome}", "The author was not told who you are. Reports like yours keep the community safe."]
        subject = "We reviewed your report on ArabDev"
    _send_notice(to, language, subject, title, lines)
