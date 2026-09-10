"""Public vs private media serving helpers."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation
from django.core.files.storage import Storage, default_storage
from django.http import FileResponse, Http404, HttpRequest, HttpResponse
from django.views.static import serve

from config.storages import get_private_storage, get_public_storage

# Preview images, thumbnails, and avatars stay publicly readable.
# Paid packages and private project references must use authenticated downloads.
PUBLIC_MEDIA_PREFIXES = (
    "products/images/",
    "products/previews/",
    "plugins/images/",
    "avatars/",
)
# Feature 16 public objects live under models/{Model_ID}/; package.zip stays private.
BATCH_PUBLIC_PREFIX = "models/"
BATCH_PRIVATE_FILENAMES = frozenset({"package.zip"})


def media_relative_path(storage_path: str) -> str | None:
    """Resolve a stored URL or relative key to an object key / MEDIA relative path."""
    if not storage_path:
        return None

    value = storage_path.strip()
    public_base = str(getattr(settings, "R2_PUBLIC_BASE_URL", "") or "").rstrip("/")
    if public_base and (
        value == public_base or value.startswith(f"{public_base}/")
    ):
        relative = value[len(public_base) :].lstrip("/")
    else:
        media_marker = "/media/"
        if media_marker in value:
            relative = value.split(media_marker, maxsplit=1)[1]
        else:
            relative = value.lstrip("/")

    if not relative or ".." in relative or relative.startswith(("/", "\\")):
        return None

    # Reject Windows drive-letter / UNC / absolute paths before storage join.
    # Without this, FileSystemStorage.safe_join can raise SuspiciousFileOperation (400).
    if len(relative) >= 2 and relative[1] == ":":
        return None
    if relative.startswith("\\\\") or Path(relative).is_absolute():
        return None

    normalized = relative.replace("\\", "/")
    if not normalized or ".." in normalized or normalized.startswith("/"):
        return None
    return normalized


def is_batch_private_object(relative: str) -> bool:
    return Path(relative.replace("\\", "/")).name.lower() in BATCH_PRIVATE_FILENAMES


def is_public_media_path(relative: str) -> bool:
    normalized = relative.replace("\\", "/")
    if any(normalized.startswith(prefix) for prefix in PUBLIC_MEDIA_PREFIXES):
        return True
    return normalized.startswith(BATCH_PUBLIC_PREFIX) and not is_batch_private_object(
        normalized
    )


def storage_for_relative(relative: str) -> Storage:
    if is_public_media_path(relative):
        return get_public_storage()
    return get_private_storage()


def open_stored_file(storage_path: str) -> FileResponse:
    relative = media_relative_path(storage_path)
    if relative is None:
        raise Http404("File not found.")

    candidates: list[Storage] = [storage_for_relative(relative)]
    primary = candidates[0]
    if primary is not default_storage:
        candidates.append(default_storage)

    handle = None
    for storage in candidates:
        try:
            exists = storage.exists(relative)
        except (OSError, SuspiciousFileOperation, ValueError):
            continue
        if not exists:
            continue
        try:
            handle = storage.open(relative, "rb")
            break
        except (OSError, SuspiciousFileOperation, ValueError, FileNotFoundError):
            continue

    if handle is None:
        raise Http404("File not found.")

    filename = Path(relative).name
    return FileResponse(handle, as_attachment=True, filename=filename)


def serve_public_media(request: HttpRequest, path: str) -> HttpResponse:
    """DEBUG-only static media handler that refuses private prefixes."""
    if not settings.DEBUG:
        raise Http404()
    if ".." in path or path.startswith(("/", "\\")) or not is_public_media_path(path):
        raise Http404()
    return serve(request, path, document_root=settings.MEDIA_ROOT)
