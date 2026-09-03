"""Named public/private file storages and public media URL helpers."""

from __future__ import annotations

import re
from urllib.parse import urljoin

import boto3
from botocore.config import Config
from django.conf import settings
from django.core.files.storage import Storage, default_storage, storages

_FILENAME_UNSAFE = re.compile(r'["\\\r\n]')


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


def signed_url_expiry_seconds() -> int:
    """Clamp R2_SIGNED_URL_EXPIRY to 60–3600 seconds."""
    raw = getattr(settings, "R2_SIGNED_URL_EXPIRY", 300)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 300
    return max(60, min(value, 3600))


def content_disposition_filename(file_name: str) -> str:
    cleaned = _FILENAME_UNSAFE.sub("", file_name).strip()
    return (cleaned or "download")[:200]


def generate_private_presigned_url(object_key: str, *, file_name: str) -> str:
    """Short-lived GET URL for a private R2 object. Never call when R2 is off."""
    if not getattr(settings, "R2_ENABLED", False):
        raise RuntimeError("Private presigned URLs require R2.")

    key = object_key.lstrip("/")
    if not key or ".." in key:
        raise ValueError("Invalid object key.")

    client = boto3.client(
        "s3",
        endpoint_url=str(settings.R2_ENDPOINT_URL),
        aws_access_key_id=str(settings.R2_ACCESS_KEY_ID),
        aws_secret_access_key=str(settings.R2_SECRET_ACCESS_KEY),
        region_name="auto",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    return client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": str(settings.R2_PRIVATE_BUCKET),
            "Key": key,
            "ResponseContentDisposition": (
                f'attachment; filename="{content_disposition_filename(file_name)}"'
            ),
        },
        ExpiresIn=signed_url_expiry_seconds(),
    )
