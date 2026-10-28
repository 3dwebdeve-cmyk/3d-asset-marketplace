"""Named public/private file storages and public media URL helpers."""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable
from typing import TypeVar
from urllib.parse import urljoin

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.core.files.storage import Storage, default_storage, storages

_FILENAME_UNSAFE = re.compile(r'["\\\r\n]')
logger = logging.getLogger("config.storages")

T = TypeVar("T")

R2_CLIENT_RETRY_ATTEMPTS = 4
STORAGE_OP_RETRY_ATTEMPTS = 3
_RETRYABLE_S3_CODES = frozenset(
    {
        "SlowDown",
        "InternalError",
        "ServiceUnavailable",
        "RequestTimeout",
        "RequestTimeTooSkewed",
    }
)


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
    raw = getattr(settings, "R2_SIGNED_URL_EXPIRY", 60)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 60
    return max(60, min(value, 3600))


def content_disposition_filename(file_name: str) -> str:
    cleaned = _FILENAME_UNSAFE.sub("", file_name).strip()
    return (cleaned or "download")[:200]


def boto_retry_config() -> Config:
    """S3 client config with standard retries for transient R2 failures."""
    return Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
        retries={"max_attempts": R2_CLIENT_RETRY_ATTEMPTS, "mode": "standard"},
        connect_timeout=5,
        read_timeout=60,
    )


def is_retryable_storage_error(exc: BaseException) -> bool:
    if isinstance(exc, ClientError):
        code = str(exc.response.get("Error", {}).get("Code", ""))
        http = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        return code in _RETRYABLE_S3_CODES or http in {429, 500, 502, 503, 504}
    if isinstance(exc, BotoCoreError):
        return True
    return isinstance(exc, OSError)


def call_with_storage_retries(
    operation: Callable[[], T],
    *,
    attempts: int = STORAGE_OP_RETRY_ATTEMPTS,
) -> T:
    last: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except Exception as exc:
            last = exc
            if attempt >= attempts or not is_retryable_storage_error(exc):
                raise
            logger.warning(
                "storage_retry attempt=%s/%s error=%s",
                attempt,
                attempts,
                exc.__class__.__name__,
            )
            time.sleep(0.05 * attempt)
    assert last is not None
    raise last


def private_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=str(settings.R2_ENDPOINT_URL),
        aws_access_key_id=str(settings.R2_ACCESS_KEY_ID),
        aws_secret_access_key=str(settings.R2_SECRET_ACCESS_KEY),
        region_name="auto",
        config=boto_retry_config(),
    )


class R2VerificationError(Exception):
    """Raised when R2 is disabled or a required bucket is unreachable."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def verify_r2_buckets() -> dict[str, str]:
    """Head both public and private R2 buckets. Requires R2_ENABLED."""
    if not getattr(settings, "R2_ENABLED", False):
        raise R2VerificationError(
            "R2 is not enabled. Set all R2_* environment variables first."
        )

    client = private_s3_client()
    buckets = {
        "public": str(settings.R2_PUBLIC_BUCKET),
        "private": str(settings.R2_PRIVATE_BUCKET),
    }
    results: dict[str, str] = {}
    for label, bucket in buckets.items():
        if not bucket:
            raise R2VerificationError(f"R2_{label.upper()}_BUCKET is empty.")
        try:
            call_with_storage_retries(lambda b=bucket: client.head_bucket(Bucket=b))
        except (BotoCoreError, ClientError, OSError, ValueError) as exc:
            raise R2VerificationError(
                f"{label} bucket '{bucket}' is unreachable: {exc.__class__.__name__}"
            ) from exc
        results[label] = "ok"
    return results


def _generate_presigned_attachment_url(bucket: str, object_key: str, *, file_name: str) -> str:
    if not getattr(settings, "R2_ENABLED", False):
        raise RuntimeError("Presigned URLs require R2.")

    key = object_key.lstrip("/")
    if not key or ".." in key:
        raise ValueError("Invalid object key.")

    client = private_s3_client()

    def _presign() -> str:
        return client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ResponseContentDisposition": (
                    f'attachment; filename="{content_disposition_filename(file_name)}"'
                ),
            },
            ExpiresIn=signed_url_expiry_seconds(),
        )

    return call_with_storage_retries(_presign)


def generate_private_presigned_url(object_key: str, *, file_name: str) -> str:
    """Short-lived GET URL for a private R2 object. Never call when R2 is off."""
    return _generate_presigned_attachment_url(
        str(settings.R2_PRIVATE_BUCKET), object_key, file_name=file_name
    )

