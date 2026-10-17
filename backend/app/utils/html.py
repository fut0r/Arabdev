"""Sanitizing rich-text post content.

The editor produces a small, known subset of HTML. Anything outside it is stripped here,
so the frontend's toolbar restrictions are also enforced on the server:

- fonts are limited to the three project fonts,
- sizes to the editor's size scale,
- colors to the ArabDev palette (CSS variables, so they adapt to light and dark themes).
"""

import html as html_lib
import re

import nh3

ALLOWED_TAGS = {
    "p",
    "br",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "a",
    "span",
    "table",
    "colgroup",
    "col",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}

# "dir" lets every block pick its own direction, so Arabic and English paragraphs
# can live in the same post and each aligns correctly.
_BLOCK = {"style", "dir"}
ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "span": {"style"},
    "p": _BLOCK,
    "h2": _BLOCK,
    "h3": _BLOCK,
    "h4": _BLOCK,
    "li": _BLOCK,
    "blockquote": {"dir"},
    "ul": {"dir"},
    "ol": {"start", "dir"},
    "pre": {"dir"},
    "code": {"class"},
    "table": {"style", "dir"},
    "col": {"style"},
    "th": {"colspan", "rowspan", "style", "dir"},
    "td": {"colspan", "rowspan", "style", "dir"},
}
TEXT_DIRECTIONS = {"ltr", "rtl", "auto"}

FONT_FAMILIES = {"alexandria": "Alexandria", "tajawal": "Tajawal", "anton": "Anton"}
FONT_SIZES = {"14px", "16px", "18px", "20px", "24px", "30px"}
TEXT_COLORS = {"red", "crimson", "ink", "graphite", "muted"}
TEXT_ALIGNS = {"left", "right", "center", "justify", "start", "end"}

_COLOR_RE = re.compile(r"^var\(--ad-text-(?P<name>[a-z]+)\)$")
_PX_RE = re.compile(r"^\d{1,4}px$")
_CODE_CLASS_RE = re.compile(r"^language-[a-z0-9+#-]{1,24}$")


def _clean_declaration(prop: str, value: str) -> str | None:
    value = value.strip()
    if prop == "text-align":
        return value if value in TEXT_ALIGNS else None
    if prop == "font-family":
        family = value.split(",")[0].strip().strip("'\"").lower()
        return FONT_FAMILIES.get(family)
    if prop == "font-size":
        return value if value in FONT_SIZES else None
    if prop == "color":
        match = _COLOR_RE.match(value.replace(" ", ""))
        if match and match.group("name") in TEXT_COLORS:
            return f"var(--ad-text-{match.group('name')})"
        return None
    if prop in ("min-width", "width"):
        return value if _PX_RE.match(value) else None
    return None


def clean_style(style: str) -> str | None:
    declarations = []
    for chunk in style.split(";"):
        if ":" not in chunk:
            continue
        prop, value = chunk.split(":", 1)
        prop = prop.strip().lower()
        cleaned = _clean_declaration(prop, value)
        if cleaned:
            declarations.append(f"{prop}: {cleaned}")
    return "; ".join(declarations) or None


def _attribute_filter(tag: str, attr: str, value: str) -> str | None:
    if attr == "style":
        return clean_style(value)
    if attr == "class":
        return value if tag == "code" and _CODE_CLASS_RE.match(value) else None
    if attr in ("colspan", "rowspan"):
        return value if value.isdigit() and 1 <= int(value) <= 20 else None
    if attr == "start":
        return value if value.isdigit() and int(value) < 10_000 else None
    if attr == "dir":
        return value if value in TEXT_DIRECTIONS else None
    return value


def sanitize_post_html(raw: str) -> str:
    return nh3.clean(
        raw or "",
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        attribute_filter=_attribute_filter,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer nofollow ugc",
        set_tag_attribute_values={"a": {"target": "_blank"}},
        strip_comments=True,
    ).strip()


_BLOCK_END_RE = re.compile(r"</(p|h2|h3|h4|li|pre|blockquote|tr|th|td)>|<br\s*/?>", re.IGNORECASE)
_WS_RE = re.compile(r"[ \t]+")


def html_to_text(content_html: str) -> str:
    spaced = _BLOCK_END_RE.sub(lambda m: m.group(0) + "\n", content_html or "")
    text = nh3.clean(spaced, tags=set())
    text = html_lib.unescape(text)
    lines = [_WS_RE.sub(" ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def excerpt(text: str, length: int = 160) -> str:
    text = " ".join((text or "").split())
    if len(text) <= length:
        return text
    return text[:length].rsplit(" ", 1)[0] + "…"


def reading_minutes(text: str) -> int:
    words = len((text or "").split())
    return max(1, round(words / 200))
