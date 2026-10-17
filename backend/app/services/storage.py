"""Storage abstraction for uploaded media.

Two backends ship: LocalStorage (files on disk, served from MEDIA_URL) and DatabaseStorage
(bytes kept in media.data and served by GET /media/{key}, for hosts without a persistent disk
such as Vercel). An S3-compatible backend only needs to implement StorageBackend and be
returned from get_storage(); nothing else changes.
"""

import contextlib
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from app.core.config import settings


class StorageBackend(Protocol):
    # True when the bytes live in media.data rather than in the backend itself.
    in_database: bool

    def save(self, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, key: str) -> None: ...

    def url(self, key: str) -> str: ...


class LocalStorage:
    in_database = False

    def __init__(self, root: Path, base_url: str) -> None:
        self.root = root
        self.base_url = base_url.rstrip("/")

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("Invalid storage key")
        return path

    def save(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, key: str) -> None:
        with contextlib.suppress(OSError, ValueError):
            self._path(key).unlink(missing_ok=True)

    def url(self, key: str) -> str:
        return f"{self.base_url}/{key}"


class DatabaseStorage:
    """Image bytes are written and deleted together with their Media row."""

    in_database = True

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def save(self, key: str, data: bytes, content_type: str) -> None:
        pass

    def delete(self, key: str) -> None:
        pass

    def url(self, key: str) -> str:
        return f"{self.base_url}/{key}"


@lru_cache
def get_storage() -> StorageBackend:
    if settings.storage_backend == "database":
        return DatabaseStorage(settings.media_url)
    return LocalStorage(settings.media_root, settings.media_url)
