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


class S3Storage:
    """New objects have an s3/ marker; existing database/local URLs remain valid."""

    in_database = False

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            config=Config(connect_timeout=5, read_timeout=15, retries={"max_attempts": 2}),
        )

    def save(self, key: str, data: bytes, content_type: str) -> None:
        if not key.startswith("s3/"):
            raise ValueError("S3 uploads require an s3/ storage key")
        self.client.put_object(
            Bucket=settings.s3_bucket,
            Key=key[3:],
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )

    def delete(self, key: str) -> None:
        if key.startswith("s3/"):
            self.client.delete_object(Bucket=settings.s3_bucket, Key=key[3:])
        else:
            LocalStorage(settings.media_root, settings.media_url).delete(key)

    def url(self, key: str) -> str:
        if key.startswith("s3/"):
            return f"{(settings.s3_public_url or '').rstrip('/')}/{key[3:]}"
        return f"{settings.media_url.rstrip('/')}/{key}"


@lru_cache
def get_storage() -> StorageBackend:
    if settings.storage_backend == "s3":
        return S3Storage()
    if settings.storage_backend == "database":
        return DatabaseStorage(settings.media_url)
    return LocalStorage(settings.media_root, settings.media_url)
