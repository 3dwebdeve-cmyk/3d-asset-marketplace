"""Local avatar storage that returns a URL reference (cloud-ready shape)."""

from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import urljoin

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile


class AvatarStorageService:
    """Persist avatar bytes to storage and return a public URL reference."""

    @classmethod
    def build_storage_key(cls, user_id: str, extension: str) -> str:
        safe_ext = extension if extension.startswith(".") else f".{extension}"
        return f"avatars/{user_id}/{uuid.uuid4().hex}{safe_ext}"

    @classmethod
    def save_avatar(cls, user_id: str, uploaded: UploadedFile, extension: str) -> str:
        key = cls.build_storage_key(str(user_id), extension)
        saved_path = default_storage.save(key, uploaded)
        return cls.build_public_url(saved_path)

    @classmethod
    def build_public_url(cls, storage_path: str) -> str:
        # Prefer absolute MEDIA URL when configured; fall back to relative media path.
        media_url = settings.MEDIA_URL
        if media_url.startswith("http://") or media_url.startswith("https://"):
            return urljoin(media_url if media_url.endswith("/") else f"{media_url}/", storage_path)

        base = getattr(settings, "PUBLIC_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
        relative = f"{media_url.rstrip('/')}/{storage_path.lstrip('/')}"
        return f"{base}{relative}"

    @classmethod
    def delete_if_managed(cls, avatar_url: str) -> None:
        """Delete a previously uploaded avatar when it lives under our media root."""
        if not avatar_url:
            return

        media_marker = "/media/"
        if media_marker not in avatar_url:
            return

        relative = avatar_url.split(media_marker, maxsplit=1)[1]
        # Reject path traversal attempts in stored avatar URLs.
        if not relative or ".." in relative or relative.startswith(("/", "\\")):
            return

        if not relative.startswith("avatars/"):
            return

        if default_storage.exists(relative):
            default_storage.delete(relative)

        # Best-effort cleanup of empty parent folder is intentionally skipped.
        _ = Path(relative)
