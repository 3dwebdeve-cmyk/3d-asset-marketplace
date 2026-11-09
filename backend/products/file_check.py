"""Check that every file a product points at is really in storage (R2, or local media).

Used by the console product page, so an administrator sees a render, thumbnail, preview or
package that the uploader never sent, or that was deleted from R2, before customers do.
Read-only: one existence check (a HEAD request on R2) per file, nothing is downloaded.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass
from pathlib import PurePosixPath

from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation
from django.core.files.storage import Storage, default_storage

from config.media import is_public_media_path, media_relative_path
from config.storages import call_with_storage_retries, get_public_storage, get_private_storage
from products.models import Product

logger = logging.getLogger(__name__)

FOUND = "found"
MISSING = "missing"
# Storage did not answer, so the file may or may not be there.
UNKNOWN = "unknown"
# A full URL on another host (for example an image linked by hand); not ours to check.
EXTERNAL = "external"

_STORAGE_ERRORS = (OSError, ValueError, SuspiciousFileOperation, BotoCoreError, ClientError)
_ABSOLUTE_URL = re.compile(r"^https?://", re.IGNORECASE)


@dataclass(frozen=True)
class FileCheck:
    role: str  # thumbnail / preview / preview_video / image / package / preview_file
    label: str
    key: str
    bucket: str  # public / private / external / invalid
    status: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


def check_product_files(product: Product) -> list[FileCheck]:
    """One entry per file the product uses, in the order the console shows them."""
    checks: list[FileCheck] = []
    if product.thumbnail:
        checks.append(_check_url("thumbnail", "Thumbnail", product.thumbnail))
    if product.preview_model:
        checks.append(_check_url("preview", "3D preview", product.preview_model))
    if product.preview_video:
        checks.append(_check_url("preview_video", "Preview video", product.preview_video))

    for number, image in enumerate(product.images.order_by("display_order", "created_at"), start=1):
        label = "Primary image" if image.is_primary else f"Image {number}"
        checks.append(_check_url("image", label, image.image_url))

    for product_file in product.files.order_by("-is_preview", "created_at"):
        role = "preview_file" if product_file.is_preview else "package"
        label = f"{'Preview file' if product_file.is_preview else 'Download'} ({product_file.file_name})"
        checks.append(_check_key(role, label, product_file.storage_path))
    return checks


def summarize(checks: list[FileCheck]) -> dict[str, object]:
    return {
        "total": len(checks),
        "missing": sum(check.status == MISSING for check in checks),
        "unknown": sum(check.status == UNKNOWN for check in checks),
        "files": [check.to_dict() for check in checks],
    }


def _check_url(role: str, label: str, url: str) -> FileCheck:
    value = (url or "").strip()
    if _ABSOLUTE_URL.match(value) and not _is_our_url(value):
        return FileCheck(role, label, value, "external", EXTERNAL)
    return _check_key(role, label, value)


def _check_key(role: str, label: str, storage_path: str) -> FileCheck:
    relative = media_relative_path(storage_path)
    if relative is None:
        # Not a path the site can serve (empty, or unsafe), so customers cannot get it either.
        return FileCheck(role, label, storage_path, "invalid", MISSING)
    public = is_public_media_path(relative)
    bucket = "public" if public else "private"
    # The site serves public files straight from the public bucket, so only that one counts.
    # Private downloads fall back to local media like the download view does.
    candidates: list[Storage] = [get_public_storage() if public else get_private_storage()]
    if not public and candidates[0] is not default_storage:
        candidates.append(default_storage)
    return FileCheck(role, label, relative, bucket, _exists_in(candidates, relative))


def _exists_in(candidates: list[Storage], relative: str) -> str:
    answered = False
    for storage in candidates:
        try:
            if call_with_storage_retries(lambda storage=storage: storage.exists(relative)):
                return FOUND
            answered = True
        except _STORAGE_ERRORS:
            logger.warning("product_file_check_storage_error key=%s", PurePosixPath(relative).name)
    return MISSING if answered else UNKNOWN


def _is_our_url(url: str) -> bool:
    public_base = str(getattr(settings, "R2_PUBLIC_BASE_URL", "") or "").rstrip("/")
    return bool(public_base and url.startswith(f"{public_base}/")) or "/media/" in url
