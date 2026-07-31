"""Local product media storage that returns a URL reference (cloud-ready shape)."""

from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import urljoin

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile


class ProductMediaStorageService:
    """Persist product media bytes and return a public URL reference."""

    IMAGE_PREFIX = "products/images/"
    # Interactive GLB/glTF previews (publicly readable in DEBUG via media serve).
    PREVIEW_PREFIX = "products/previews/"
    # Paid / downloadable packages (private — authenticated download endpoints only).
    FILE_PREFIX = "products/files/"

    @classmethod
    def build_storage_key(cls, prefix: str, product_id: str, extension: str) -> str:
        safe_ext = extension if extension.startswith(".") else f".{extension}"
        return f"{prefix}{product_id}/{uuid.uuid4().hex}{safe_ext}"

    @classmethod
    def save_image(cls, product_id: str, uploaded: UploadedFile, extension: str) -> str:
        key = cls.build_storage_key(cls.IMAGE_PREFIX, str(product_id), extension)
        saved_path = default_storage.save(key, uploaded)
        return cls.build_public_url(saved_path)

    @classmethod
    def save_preview(cls, product_id: str, uploaded: UploadedFile, extension: str) -> str:
        key = cls.build_storage_key(cls.PREVIEW_PREFIX, str(product_id), extension)
        saved_path = default_storage.save(key, uploaded)
        return cls.build_public_url(saved_path)

    @classmethod
    def save_file(cls, product_id: str, uploaded: UploadedFile, extension: str) -> str:
        key = cls.build_storage_key(cls.FILE_PREFIX, str(product_id), extension)
        saved_path = default_storage.save(key, uploaded)
        return cls.build_public_url(saved_path)

    @classmethod
    def build_public_url(cls, storage_path: str) -> str:
        media_url = settings.MEDIA_URL
        if media_url.startswith("http://") or media_url.startswith("https://"):
            return urljoin(
                media_url if media_url.endswith("/") else f"{media_url}/",
                storage_path,
            )

        base = getattr(settings, "PUBLIC_API_BASE_URL", "http://127.0.0.1:8000").rstrip(
            "/"
        )
        relative = f"{media_url.rstrip('/')}/{storage_path.lstrip('/')}"
        return f"{base}{relative}"

    @classmethod
    def delete_if_managed(cls, media_url: str, *, prefix: str) -> None:
        if not media_url:
            return

        media_marker = "/media/"
        if media_marker not in media_url:
            return

        relative = media_url.split(media_marker, maxsplit=1)[1]
        if not relative or ".." in relative or relative.startswith(("/", "\\")):
            return

        if not relative.startswith(prefix):
            return

        if default_storage.exists(relative):
            default_storage.delete(relative)

        _ = Path(relative)
