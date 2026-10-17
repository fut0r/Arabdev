"""Small JSON cache over Redis with an in-process fallback. Used for hot, cheap-to-stale reads."""

import json
import logging
import threading
import time
from typing import Any

from app.core.redis_client import get_redis

logger = logging.getLogger("arabdev.cache")

_memory: dict[str, tuple[float, str]] = {}
_lock = threading.Lock()


def cache_get(key: str) -> Any | None:
    client = get_redis()
    if client is not None:
        try:
            raw = client.get(f"cache:{key}")
            return json.loads(raw) if raw else None
        except Exception:
            return None
    with _lock:
        item = _memory.get(key)
        if not item:
            return None
        expires_at, raw = item
        if expires_at < time.monotonic():
            _memory.pop(key, None)
            return None
        return json.loads(raw)


def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    raw = json.dumps(value, default=str)
    client = get_redis()
    if client is not None:
        try:
            client.setex(f"cache:{key}", ttl_seconds, raw)
            return
        except Exception:
            # Redis being down must not break a request: fall back to this process's memory.
            logger.debug("Redis cache write failed; using memory", exc_info=True)
    with _lock:
        _memory[key] = (time.monotonic() + ttl_seconds, raw)


def cache_delete_prefix(prefix: str) -> None:
    client = get_redis()
    if client is not None:
        try:
            for key in client.scan_iter(f"cache:{prefix}*"):
                client.delete(key)
        except Exception:
            logger.debug("Redis cache delete failed", exc_info=True)
    with _lock:
        for key in [k for k in _memory if k.startswith(prefix)]:
            _memory.pop(key, None)


def cache_clear() -> None:
    with _lock:
        _memory.clear()
