"""Named public/private file storages and public media URL helpers."""

from __future__ import annotations

from urllib.parse import urljoin

from django.conf import settings
from django.core.files.storage import Storage, default_storage, storages


def get_public_storage() -> Storage:
    """Public bucket when R2 is on; local MEDIA_ROOT otherwise."""
    if getattr(settings, "R2_ENABLED", False):
        return storages["public"]
    return default_storage


def get_private_storage() -> Storage:
    """Private bucket when R2 is on; local MEDIA_ROOT otherwise."""
    if getattr(settings, "R2_ENABLED", False):
        return storages["private"]
    return default_storage


def build_public_media_url(object_key: str) -> str:
    """Absolute URL for a public object (R2 CDN or local /media/)."""
    key = object_key.lstrip("/")
    if getattr(settings, "R2_ENABLED", False):
        base = str(getattr(settings, "R2_PUBLIC_BASE_URL", "")).rstrip("/")
        return f"{base}/{key}"

    media_url = settings.MEDIA_URL
    if media_url.startswith("http://") or media_url.startswith("https://"):
        return urljoin(
            media_url if media_url.endswith("/") else f"{media_url}/",
            key,
        )

    base = getattr(settings, "PUBLIC_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    relative = f"{media_url.rstrip('/')}/{key}"
    return f"{base}{relative}"
