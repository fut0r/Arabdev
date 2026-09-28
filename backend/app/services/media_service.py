"""Image upload validation and processing.

Every upload is decoded with Pillow, checked (type, byte size, dimensions) and re-encoded
to WebP. Re-encoding strips metadata and anything smuggled after the image data, so the
bytes we serve are never the bytes the client sent.
"""

import io
import uuid
from dataclasses import dataclass

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session, undefer

from app.core.config import settings
from app.core.errors import BadRequest, Forbidden, NotFound, UnprocessableEntity
from app.models import Draft, Media, Post, Profile, User
from app.services.storage import get_storage
from app.utils.time import utcnow

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
_DECODE_ERRORS = (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError)


@dataclass(frozen=True)
class ImageRules:
    min_side: int
    max_side: int
    output_max: int
    square: bool


RULES = {
    "avatar": ImageRules(min_side=96, max_side=8000, output_max=400, square=True),
    "post_image": ImageRules(min_side=64, max_side=10000, output_max=1600, square=False),
}


@dataclass
class ProcessedImage:
    data: bytes
    width: int
    height: int
    content_type: str = "image/webp"


def process_image(raw: bytes, kind: str) -> ProcessedImage:
    rules = RULES[kind]
    if len(raw) > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes // (1024 * 1024)
        raise UnprocessableEntity(f"Images must be {limit_mb} MB or smaller", "file_too_large", field="file")
    try:
        probe = Image.open(io.BytesIO(raw))
        image_format = probe.format
        probe.verify()
    except _DECODE_ERRORS:
        raise UnprocessableEntity("This file is not a valid image", "file_not_image", field="file") from None

    if image_format not in ALLOWED_FORMATS:
        raise UnprocessableEntity("Use a JPEG, PNG, WebP or GIF image", "file_type_not_allowed", field="file")

    # The header gives the dimensions, so images that are too big are turned away before their
    # pixels are decoded: a few megabytes of compressed data can expand to gigabytes in memory.
    width, height = probe.size
    if min(width, height) < rules.min_side:
        raise UnprocessableEntity(
            f"Image is too small (minimum {rules.min_side}×{rules.min_side}px)", "image_too_small", field="file"
        )
    if max(width, height) > rules.max_side or width * height > MAX_PIXELS:
        raise UnprocessableEntity("Image dimensions are too large", "image_too_large", field="file")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except _DECODE_ERRORS:
        raise UnprocessableEntity("This file is not a valid image", "file_not_image", field="file") from None

    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    image = image.convert("RGBA" if has_alpha else "RGB")

    if rules.square:
        image = ImageOps.fit(image, (rules.output_max, rules.output_max), Image.Resampling.LANCZOS)
    else:
        image.thumbnail((rules.output_max, rules.output_max), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=85, method=4)
    return ProcessedImage(data=buffer.getvalue(), width=image.width, height=image.height)


async def read_upload(upload: UploadFile) -> bytes:
    if upload.content_type and upload.content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise UnprocessableEntity("Use a JPEG, PNG, WebP or GIF image", "file_type_not_allowed", field="file")
    raw = await upload.read(settings.max_upload_bytes + 1)
    if not raw:
        raise BadRequest("The uploaded file is empty", "file_empty", field="file")
    return raw


def store_image(db: Session, owner: User, raw: bytes, kind: str) -> Media:
    if kind not in RULES:
        raise BadRequest("Unknown media kind", "media_kind_invalid", field="kind")
    processed = process_image(raw, kind)
    now = utcnow()
    key = f"{kind}/{now:%Y/%m}/{uuid.uuid4().hex}.webp"
    storage = get_storage()
    storage.save(key, processed.data, processed.content_type)
    media = Media(
        owner_id=owner.id,
        kind=kind,
        storage_key=key,
        content_type=processed.content_type,
        size_bytes=len(processed.data),
        width=processed.width,
        height=processed.height,
        data=processed.data if storage.in_database else None,
    )
    db.add(media)
    db.flush()
    return media


def media_url(media: Media | None) -> str | None:
    return get_storage().url(media.storage_key) if media else None


def get_owned_media(db: Session, owner: User, media_id: int, kind: str) -> Media:
    media = db.get(Media, media_id)
    if media is None:
        raise NotFound("Image not found", "media_not_found", field="image_media_id")
    if media.owner_id != owner.id:
        raise Forbidden("You can only attach your own uploads", "media_not_owned", field="image_media_id")
    if media.kind != kind:
        raise BadRequest("This upload cannot be used here", "media_kind_invalid", field="image_media_id")
    return media


def is_referenced(db: Session, media_id: int) -> bool:
    return bool(
        db.scalar(select(Post.id).where(Post.image_media_id == media_id).limit(1))
        or db.scalar(select(Draft.id).where(Draft.image_media_id == media_id).limit(1))
        or db.scalar(select(Profile.user_id).where(Profile.avatar_media_id == media_id).limit(1))
    )


def delete_media(db: Session, media: Media) -> None:
    key = media.storage_key
    db.delete(media)
    db.flush()
    get_storage().delete(key)


def delete_if_orphaned(db: Session, media_id: int | None) -> None:
    if media_id is None:
        return
    media = db.get(Media, media_id)
    if media is not None and not is_referenced(db, media_id):
        delete_media(db, media)


def load_file(db: Session, key: str) -> Media | None:
    """The media row for a storage key, with its bytes (used by DatabaseStorage)."""
    return db.scalar(select(Media).where(Media.storage_key == key).options(undefer(Media.data)))


def storage_keys_for_user(db: Session, user_id: int) -> list[str]:
    return list(db.scalars(select(Media.storage_key).where(Media.owner_id == user_id)))

