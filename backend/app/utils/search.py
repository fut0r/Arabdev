"""Search normalization preserves the original text used for display."""

import re
import unicodedata

_ARABIC_MARKS = re.compile(r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]")
_LETTERS = str.maketrans("أإآٱى", "ااااي")


def normalize_search(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", value or "").casefold()
    return " ".join(_ARABIC_MARKS.sub("", text).translate(_LETTERS).split())


def content_language(text: str, requested: str = "auto") -> str:
    if requested != "auto":
        return requested
    arabic = len(re.findall(r"[\u0621-\u064a]", text))
    latin = len(re.findall(r"[a-zA-Z]", text))
    total = arabic + latin
    if total and arabic / total >= 0.2 and latin / total >= 0.2:
        return "mul"
    return "ar" if arabic > latin else "en"
