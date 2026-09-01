"""Avatar storage on the public media backend."""

from __future__ import annotations

import uuid
from pathlib import Path

from django.core.files.uploadedfile import UploadedFile

from config.media import media_relative_path
from config.storages import build_public_media_url, get_public_storage


class AvatarStorageService:
    """Persist avatar bytes to public storage and return a public URL reference."""

    PREFIX = "avatars/"

    @classmethod
    def build_storage_key(cls, user_id: str, extension: str) -> str:
        safe_ext = extension if extension.startswith(".") else f".{extension}"
        return f"{cls.PREFIX}{user_id}/{uuid.uuid4().hex}{safe_ext}"

    @classmethod
    def save_avatar(cls, user_id: str, uploaded: UploadedFile, extension: str) -> str:
        key = cls.build_storage_key(str(user_id), extension)
        saved_path = get_public_storage().save(key, uploaded)
        return cls.build_public_url(saved_path)

    @classmethod
    def build_public_url(cls, storage_path: str) -> str:
        return build_public_media_url(storage_path)

    @classmethod
    def delete_if_managed(cls, avatar_url: str) -> None:
        """Delete a previously uploaded avatar when it lives under our public prefix."""
        if not avatar_url:
            return

        relative = media_relative_path(avatar_url)
        if relative is None or not relative.startswith(cls.PREFIX):
            return

        storage = get_public_storage()
        if storage.exists(relative):
            storage.delete(relative)

        _ = Path(relative)
