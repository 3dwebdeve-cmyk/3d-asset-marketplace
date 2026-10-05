"""Product image and file upload validation (MIME, extension, size, integrity)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, UnidentifiedImageError

PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
PRODUCT_FILE_MAX_BYTES = 50 * 1024 * 1024  # 50 MB
# Interactive GLB/glTF previews must stay small enough for the browser viewer.
PRODUCT_PREVIEW_MAX_BYTES = 12 * 1024 * 1024  # 12 MB
PRODUCT_PREVIEW_EXTENSIONS = frozenset({".glb", ".gltf"})

PRODUCT_IMAGE_ALLOWED_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})
PRODUCT_IMAGE_ALLOWED_MIME_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp"}
)

PRODUCT_FILE_ALLOWED_EXTENSIONS = frozenset(
    {".glb", ".gltf", ".blend", ".fbx", ".obj", ".usdz", ".zip", ".rar", ".7z"}
)
PRODUCT_FILE_ALLOWED_MIME_TYPES = frozenset(
    {
        "model/gltf-binary",
        "model/gltf+json",
        "model/vnd.usdz+zip",
        "application/octet-stream",
        "application/zip",
        "application/x-zip-compressed",
        "application/x-rar-compressed",
        "application/vnd.rar",
        "application/x-7z-compressed",
    }
)

_EXTENSION_TO_FORMAT = {
    ".glb": "glb",
    ".gltf": "gltf",
    ".blend": "blend",
    ".fbx": "fbx",
    ".obj": "obj",
    ".usdz": "usdz",
    ".zip": "zip",
    ".rar": "rar",
    ".7z": "7z",
}

_PIL_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


@dataclass(frozen=True)
class ValidatedProductImageUpload:
    file: UploadedFile
    extension: str
    mime_type: str


@dataclass(frozen=True)
class ValidatedProductFileUpload:
    file: UploadedFile
    extension: str
    mime_type: str
    file_format: str


def _normalize_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def validate_product_image_upload(uploaded: UploadedFile) -> ValidatedProductImageUpload:
    if not uploaded or not getattr(uploaded, "name", None):
        raise ValidationError({"image": "Image file is required."})

    extension = _normalize_extension(uploaded.name)
    if extension not in PRODUCT_IMAGE_ALLOWED_EXTENSIONS:
        raise ValidationError(
            {
                "image": (
                    "Invalid file extension. Allowed: "
                    f"{', '.join(sorted(PRODUCT_IMAGE_ALLOWED_EXTENSIONS))}."
                )
            }
        )

    declared_mime = (uploaded.content_type or "").lower().strip()
    if declared_mime not in PRODUCT_IMAGE_ALLOWED_MIME_TYPES:
        raise ValidationError(
            {
                "image": (
                    "Invalid MIME type. Allowed: "
                    f"{', '.join(sorted(PRODUCT_IMAGE_ALLOWED_MIME_TYPES))}."
                )
            }
        )

    size = getattr(uploaded, "size", None)
    if size is None:
        raise ValidationError({"image": "Unable to determine file size."})
    if size <= 0:
        raise ValidationError({"image": "Image file is empty."})
    if size > PRODUCT_IMAGE_MAX_BYTES:
        raise ValidationError(
            {
                "image": (
                    f"Image must be {PRODUCT_IMAGE_MAX_BYTES // (1024 * 1024)} MB "
                    "or smaller."
                )
            }
        )

    try:
        uploaded.seek(0)
        with Image.open(uploaded) as image:
            image.verify()
            detected_format = (image.format or "").upper()
    except UnidentifiedImageError as exc:
        raise ValidationError({"image": "File is not a valid image."}) from exc
    except OSError as exc:
        raise ValidationError({"image": "Unable to read image metadata."}) from exc
    finally:
        uploaded.seek(0)

    detected_mime = _PIL_FORMAT_TO_MIME.get(detected_format)
    if detected_mime is None or detected_mime not in PRODUCT_IMAGE_ALLOWED_MIME_TYPES:
        raise ValidationError(
            {"image": "Image content does not match an allowed type."}
        )

    if extension in {".jpg", ".jpeg"} and detected_mime != "image/jpeg":
        raise ValidationError(
            {"image": "File extension does not match image content."}
        )
    if extension == ".png" and detected_mime != "image/png":
        raise ValidationError(
            {"image": "File extension does not match image content."}
        )
    if extension == ".webp" and detected_mime != "image/webp":
        raise ValidationError(
            {"image": "File extension does not match image content."}
        )

    return ValidatedProductImageUpload(
        file=uploaded,
        extension=extension,
        mime_type=detected_mime,
    )


def validate_product_file_upload(uploaded: UploadedFile) -> ValidatedProductFileUpload:
    if not uploaded or not getattr(uploaded, "name", None):
        raise ValidationError({"file": "Product file is required."})

    extension = _normalize_extension(uploaded.name)
    if extension not in PRODUCT_FILE_ALLOWED_EXTENSIONS:
        raise ValidationError(
            {
                "file": (
                    "Invalid file extension. Allowed: "
                    f"{', '.join(sorted(PRODUCT_FILE_ALLOWED_EXTENSIONS))}."
                )
            }
        )

    declared_mime = (uploaded.content_type or "").lower().strip()
    if not declared_mime:
        raise ValidationError({"file": "Content-Type header is required."})
    if declared_mime not in PRODUCT_FILE_ALLOWED_MIME_TYPES:
        raise ValidationError(
            {
                "file": (
                    "Invalid MIME type for product file. Allowed: "
                    f"{', '.join(sorted(PRODUCT_FILE_ALLOWED_MIME_TYPES))}."
                )
            }
        )

    size = getattr(uploaded, "size", None)
    if size is None:
        raise ValidationError({"file": "Unable to determine file size."})
    if size <= 0:
        raise ValidationError({"file": "Product file is empty."})

    max_bytes = (
        PRODUCT_PREVIEW_MAX_BYTES
        if extension in PRODUCT_PREVIEW_EXTENSIONS
        else PRODUCT_FILE_MAX_BYTES
    )
    if size > max_bytes:
        kind = "Preview model" if extension in PRODUCT_PREVIEW_EXTENSIONS else "File"
        raise ValidationError(
            {
                "file": (
                    f"{kind} must be {max_bytes // (1024 * 1024)} MB "
                    "or smaller."
                )
            }
        )

    file_format = _EXTENSION_TO_FORMAT[extension]
    from config.upload_security import inspect_product_content

    inspect_product_content(uploaded, extension)
    return ValidatedProductFileUpload(
        file=uploaded,
        extension=extension,
        mime_type=declared_mime,
        file_format=file_format,
    )
