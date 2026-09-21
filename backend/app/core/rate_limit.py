"""Fixed-window rate limiting backed by Redis, with an in-memory fallback.

Usage in a route::

    @router.post("/login", dependencies=[Depends(rate_limit("login", limit=10, window=60))])
"""

import hashlib
import logging
import threading
import time
from collections.abc import Callable

from fastapi import Request

from app.core.config import settings
from app.core.errors import TooManyRequests
from app.core.redis_client import get_redis

logger = logging.getLogger("arabdev.rate_limit")


class MemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, tuple[int, int]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = int(time.time())
        window_start = now - (now % window)
        with self._lock:
            start, count = self._hits.get(key, (window_start, 0))
            if start != window_start:
                start, count = window_start, 0
            count += 1
            self._hits[key] = (start, count)
            if len(self._hits) > 50_000:
                self._hits = {k: v for k, v in self._hits.items() if v[0] == window_start}
        return count <= limit, window - (now - window_start)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


class RedisRateLimiter:
    def __init__(self, client) -> None:
        self._client = client

    def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        now = int(time.time())
        window_start = now - (now % window)
        redis_key = f"rl:{key}:{window_start}"
        pipe = self._client.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, window + 1)
        count, _ = pipe.execute()
        return int(count) <= limit, window - (now - window_start)

    def reset(self) -> None:  # pragma: no cover - only used in tests with memory backend
        pass


_memory_limiter = MemoryRateLimiter()


def get_limiter() -> MemoryRateLimiter | RedisRateLimiter:
    client = get_redis()
    if client is not None:
        return RedisRateLimiter(client)
    return _memory_limiter


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def consume(scope: str, identifier: str, limit: int, window: int) -> tuple[bool, int]:
    """Count one attempt against `identifier` (an email, a user id) outside the request
    dependency chain. Returns (allowed, seconds until the window resets)."""
    if not settings.rate_limit_enabled:
        return True, 0
    key = f"{scope}:{hashlib.sha256(identifier.lower().encode()).hexdigest()[:32]}"
    try:
        return get_limiter().hit(key, limit, window)
    except Exception:  # Never take the API down because Redis hiccupped.
        logger.warning("Rate limiter unavailable, allowing request", exc_info=True)
        return True, 0


def rate_limit(scope: str, limit: int, window: int) -> Callable[[Request], None]:
    def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        key = f"{scope}:{client_ip(request)}"
        try:
            allowed, retry_after = get_limiter().hit(key, limit, window)
        except Exception:  # Never take the API down because Redis hiccupped.
            logger.warning("Rate limiter unavailable, allowing request", exc_info=True)
            return
        if not allowed:
            raise TooManyRequests(
                "Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(max(retry_after, 1))},
            )

    return dependency
