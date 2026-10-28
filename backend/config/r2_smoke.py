"""Phase C1 — private R2 presign smoke (does not print secrets).

Puts a tiny throwaway object in the private bucket, resolves it through
``resolve_private_download`` (same path as entitled downloads), asserts the
signed JSON shape has no ``storage_path``, then deletes the object.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings

from config.media import PrivateFileNotFound, resolve_private_download
from config.storages import private_s3_client

SMOKE_KEY_PREFIX = "_verify_r2_smoke/"
SMOKE_FILE_NAME = "r2-smoke.bin"
SMOKE_BODY = b"3dam-r2-smoke"


@dataclass(frozen=True)
class R2PresignSmokeResult:
    signed_json_ok: bool
    storage_path_omitted: bool
    expires_in: int
    fetch_ok: bool
    cleaned_up: bool


class R2SmokeError(Exception):
    """Operator-facing smoke failure (no secrets in message)."""


def run_private_presign_smoke() -> R2PresignSmokeResult:
    """Exercise private bucket put → resolve_private_download → GET → delete."""
    if not getattr(settings, "R2_ENABLED", False):
        raise R2SmokeError(
            "R2 is not enabled. Set all R2_* environment variables first."
        )

    private_bucket = str(getattr(settings, "R2_PRIVATE_BUCKET", "") or "").strip()
    if not private_bucket:
        raise R2SmokeError("R2_PRIVATE_BUCKET is empty.")

    key = f"{SMOKE_KEY_PREFIX}{uuid.uuid4().hex}.bin"
    client = private_s3_client()
    cleaned_up = False
    signed_json_ok = False
    storage_path_omitted = False
    expires_in = 0
    fetch_ok = False

    try:
        try:
            client.put_object(
                Bucket=private_bucket,
                Key=key,
                Body=SMOKE_BODY,
                ContentType="application/octet-stream",
            )
        except (BotoCoreError, ClientError, OSError, ValueError) as exc:
            raise R2SmokeError(
                f"Failed to put smoke object: {exc.__class__.__name__}"
            ) from exc

        try:
            result: Any = resolve_private_download(key, file_name=SMOKE_FILE_NAME)
        except PrivateFileNotFound as exc:
            raise R2SmokeError(
                "resolve_private_download did not find the smoke object."
            ) from exc

        if not isinstance(result, dict):
            raise R2SmokeError(
                "Expected signed JSON from resolve_private_download; got a stream."
            )

        if "storage_path" in result:
            raise R2SmokeError("Signed download JSON must not include storage_path.")
        storage_path_omitted = True

        download_url = result.get("download_url")
        raw_expires = result.get("expires_in")
        if not isinstance(download_url, str) or not download_url.startswith("http"):
            raise R2SmokeError("Signed JSON missing a valid download_url.")
        if not isinstance(raw_expires, int) or raw_expires < 60:
            raise R2SmokeError("Signed JSON missing a valid expires_in.")
        expires_in = raw_expires
        signed_json_ok = True

        fetch_ok = _fetch_smoke_bytes(download_url)
    finally:
        try:
            client.delete_object(Bucket=private_bucket, Key=key)
            cleaned_up = True
        except (BotoCoreError, ClientError, OSError, ValueError):
            cleaned_up = False

    return R2PresignSmokeResult(
        signed_json_ok=signed_json_ok,
        storage_path_omitted=storage_path_omitted,
        expires_in=expires_in,
        fetch_ok=fetch_ok,
        cleaned_up=cleaned_up,
    )


def _fetch_smoke_bytes(download_url: str) -> bool:
    """GET the signed URL and confirm body matches the smoke payload."""
    if not download_url.startswith("https://"):
        return False
    request = Request(download_url, method="GET")
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310  # nosec B310 - https checked above
            body = response.read()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise R2SmokeError(
            f"Signed URL GET failed: {exc.__class__.__name__}"
        ) from exc

    if body != SMOKE_BODY:
        raise R2SmokeError("Signed URL returned unexpected body.")
    return True
