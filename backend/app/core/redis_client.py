"""Lazily-connected Redis client. Returns None when Redis is not configured or unreachable."""

import logging
import time
from urllib.parse import urlsplit

from app.core.config import settings

logger = logging.getLogger("arabdev.redis")

_client = None
_last_failure: float = 0.0
# After a failed connection, callers use the in-memory fallback for this long before retrying.
_RETRY_AFTER_SECONDS = 10
# The first connection from a fresh serverless instance includes a TLS handshake, which can take
# well over half a second; later commands on the open connection are fast.
_CONNECT_TIMEOUT_SECONDS = 2.0
_COMMAND_TIMEOUT_SECONDS = 1.0


def _host_of(url: str) -> str:
    """The host and port only: the URL itself carries the password and must not reach the logs."""
    parts = urlsplit(url)
    return f"{parts.hostname}:{parts.port}" if parts.port else str(parts.hostname)


def get_redis():
    global _client, _last_failure
    if not settings.redis_url:
        return None
    if _client is not None:
        return _client
    if time.monotonic() - _last_failure < _RETRY_AFTER_SECONDS:
        return None
    try:
        import redis

        client = redis.Redis.from_url(
            settings.redis_url,
            socket_timeout=_COMMAND_TIMEOUT_SECONDS,
            socket_connect_timeout=_CONNECT_TIMEOUT_SECONDS,
        )
        client.ping()
        _client = client
        logger.info("Connected to Redis at %s", _host_of(settings.redis_url))
        return _client
    except Exception:
        _last_failure = time.monotonic()
        logger.warning("Redis unavailable at %s; using in-memory fallback", _host_of(settings.redis_url))
        return None
