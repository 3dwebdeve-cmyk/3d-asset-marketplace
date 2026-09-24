"""Product media storage: public bucket for previews/images, private for packages."""

from __future__ import annotations

import uuid
from pathlib import Path

from django.core.files.uploadedfile import UploadedFile

from config.media import is_public_media_path, media_relative_path
from config.storages import (
    build_public_media_url,
    get_private_storage,
    get_public_storage,
)


class ProductMediaStorageService:
    """Persist product media bytes and return a URL (public) or object key (private)."""

    IMAGE_PREFIX = "products/images/"
    # Interactive GLB/glTF previews (publicly readable).
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
        saved_path = get_public_storage().save(key, uploaded)
        return cls.build_public_url(saved_path)

    @classmethod
    def save_preview(cls, product_id: str, uploaded: UploadedFile, extension: str) -> str:
        key = cls.build_storage_key(cls.PREVIEW_PREFIX, str(product_id), extension)
        saved_path = get_public_storage().save(key, uploaded)
        return cls.build_public_url(saved_path)

    @classmethod
    def save_file(cls, product_id: str, uploaded: UploadedFile, extension: str) -> str:
        key = cls.build_storage_key(cls.FILE_PREFIX, str(product_id), extension)
        return get_private_storage().save(key, uploaded)

    @classmethod
    def build_public_url(cls, storage_path: str) -> str:
        return build_public_media_url(storage_path)

    @classmethod
    def delete_if_managed(cls, media_url: str, *, prefix: str) -> None:
        if not media_url:
            return

        relative = media_relative_path(media_url)
        if relative is None or not relative.startswith(prefix):
            return

        storage = (
            get_public_storage()
            if is_public_media_path(relative)
            else get_private_storage()
        )
        if storage.exists(relative):
            storage.delete(relative)

        _ = Path(relative)
