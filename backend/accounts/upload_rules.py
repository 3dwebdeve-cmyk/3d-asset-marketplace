"""Avatar upload validation rules (MIME, extension, size, image integrity)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, UnidentifiedImageError

# Avatars stay small; product assets can use larger limits later.
AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2 MB

AVATAR_ALLOWED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})
AVATAR_ALLOWED_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})

# Maps Pillow formats to allowed MIME for content sniffing.
_PIL_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


@dataclass(frozen=True)
class ValidatedAvatarUpload:
    file: UploadedFile
    extension: str
    mime_type: str


def _normalize_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def validate_avatar_upload(uploaded: UploadedFile) -> ValidatedAvatarUpload:
    if not uploaded or not getattr(uploaded, "name", None):
        raise ValidationError({"avatar": "Avatar file is required."})

    extension = _normalize_extension(uploaded.name)
    if extension not in AVATAR_ALLOWED_EXTENSIONS:
        raise ValidationError(
            {
                "avatar": (
                    "Invalid file extension. Allowed: "
                    f"{', '.join(sorted(AVATAR_ALLOWED_EXTENSIONS))}."
                )
            }
        )

    declared_mime = (uploaded.content_type or "").lower().strip()
    if declared_mime not in AVATAR_ALLOWED_MIME_TYPES:
        raise ValidationError(
            {
                "avatar": (
                    "Invalid MIME type. Allowed: "
                    f"{', '.join(sorted(AVATAR_ALLOWED_MIME_TYPES))}."
                )
            }
        )

    size = getattr(uploaded, "size", None)
    if size is None:
        raise ValidationError({"avatar": "Unable to determine file size."})
    if size <= 0:
        raise ValidationError({"avatar": "Avatar file is empty."})
    if size > AVATAR_MAX_BYTES:
        raise ValidationError(
            {
                "avatar": (
                    f"Avatar must be {AVATAR_MAX_BYTES // (1024 * 1024)} MB or smaller."
                )
            }
        )

    try:
        uploaded.seek(0)
        with Image.open(uploaded) as image:
            image.verify()
            detected_format = (image.format or "").upper()
    except UnidentifiedImageError as exc:
        raise ValidationError(
            {"avatar": "File is not a valid image."}
        ) from exc
    except OSError as exc:
        raise ValidationError(
            {"avatar": "Unable to read image metadata."}
        ) from exc
    finally:
        uploaded.seek(0)

    detected_mime = _PIL_FORMAT_TO_MIME.get(detected_format)
    if detected_mime is None or detected_mime not in AVATAR_ALLOWED_MIME_TYPES:
        raise ValidationError(
            {"avatar": "Image content does not match an allowed type."}
        )

    # Reject extension/MIME mismatches against sniffed content.
    if extension in {".jpg", ".jpeg"} and detected_mime != "image/jpeg":
        raise ValidationError(
            {"avatar": "File extension does not match image content."}
        )
    if extension == ".png" and detected_mime != "image/png":
        raise ValidationError(
            {"avatar": "File extension does not match image content."}
        )
    if extension == ".webp" and detected_mime != "image/webp":
        raise ValidationError(
            {"avatar": "File extension does not match image content."}
        )

    return ValidatedAvatarUpload(
        file=uploaded,
        extension=extension,
        mime_type=detected_mime,
    )
