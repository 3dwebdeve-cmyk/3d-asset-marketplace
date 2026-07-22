"""Reference file upload validation for custom projects."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, UnidentifiedImageError

PROJECT_FILE_MAX_BYTES = 20 * 1024 * 1024  # 20 MB

PROJECT_FILE_ALLOWED_EXTENSIONS = frozenset(
    {".jpg", ".jpeg", ".png", ".webp", ".pdf", ".zip"}
)
PROJECT_FILE_ALLOWED_MIME_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/zip",
        "application/x-zip-compressed",
    }
)

_IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})
_PIL_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


@dataclass(frozen=True)
class ValidatedProjectFileUpload:
    file: UploadedFile
    extension: str
    mime_type: str


def _normalize_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def validate_project_file_upload(uploaded: UploadedFile) -> ValidatedProjectFileUpload:
    if not uploaded or not getattr(uploaded, "name", None):
        raise ValidationError({"file": "Reference file is required."})

    extension = _normalize_extension(uploaded.name)
    if extension not in PROJECT_FILE_ALLOWED_EXTENSIONS:
        raise ValidationError(
            {
                "file": (
                    "Invalid file extension. Allowed: "
                    f"{', '.join(sorted(PROJECT_FILE_ALLOWED_EXTENSIONS))}."
                )
            }
        )

    declared_mime = (uploaded.content_type or "").lower().strip()
    if declared_mime not in PROJECT_FILE_ALLOWED_MIME_TYPES:
        raise ValidationError(
            {
                "file": (
                    "Invalid MIME type. Allowed: "
                    f"{', '.join(sorted(PROJECT_FILE_ALLOWED_MIME_TYPES))}."
                )
            }
        )

    size = getattr(uploaded, "size", None)
    if size is None:
        raise ValidationError({"file": "Unable to determine file size."})
    if size <= 0:
        raise ValidationError({"file": "Reference file is empty."})
    if size > PROJECT_FILE_MAX_BYTES:
        raise ValidationError(
            {
                "file": (
                    f"Reference file must be "
                    f"{PROJECT_FILE_MAX_BYTES // (1024 * 1024)} MB or smaller."
                )
            }
        )

    if extension in _IMAGE_EXTENSIONS:
        try:
            uploaded.seek(0)
            with Image.open(uploaded) as image:
                image.verify()
                detected_mime = _PIL_FORMAT_TO_MIME.get(image.format or "")
            uploaded.seek(0)
        except UnidentifiedImageError as exc:
            raise ValidationError({"file": "Invalid or corrupted image file."}) from exc
        if not detected_mime or detected_mime != declared_mime:
            raise ValidationError({"file": "Image content does not match MIME type."})
    elif extension == ".pdf":
        uploaded.seek(0)
        header = uploaded.read(5)
        uploaded.seek(0)
        if header != b"%PDF-":
            raise ValidationError({"file": "Invalid PDF file."})
    elif extension == ".zip":
        uploaded.seek(0)
        header = uploaded.read(4)
        uploaded.seek(0)
        if header[:2] != b"PK":
            raise ValidationError({"file": "Invalid ZIP archive."})

    return ValidatedProjectFileUpload(
        file=uploaded,
        extension=extension,
        mime_type=declared_mime,
    )
