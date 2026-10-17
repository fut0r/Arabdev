"""Encryption for the few secrets the server has to read back, such as authenticator keys.

Passwords and codes are hashed, never encrypted; this is only for values that must be used
again. The key is derived from SECRET_KEY, so a copy of the database alone is not enough to
read them. Changing SECRET_KEY makes them unreadable: authenticator sign-in then stops working
until people set it up again (recovery codes, being hashes, keep working).
"""

import base64
import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet(purpose: str) -> Fernet:
    key = hmac.new(settings.secret_key.encode(), f"arabdev:{purpose}:v1".encode(), hashlib.sha256).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str, purpose: str) -> str:
    return _fernet(purpose).encrypt(value.encode()).decode()


def decrypt(token: str, purpose: str) -> str | None:
    """The plain value, or None when it cannot be read (for example after a key change)."""
    try:
        return _fernet(purpose).decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None
