"""Public vs private media serving helpers."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpRequest, HttpResponse
from django.views.static import serve

# Preview images, thumbnails, and avatars stay publicly readable.
# Paid packages and private project references must use authenticated downloads.
PUBLIC_MEDIA_PREFIXES = (
    "products/images/",
    "plugins/images/",
    "avatars/",
)


def media_relative_path(storage_path: str) -> str | None:
    """Resolve a stored URL or relative key to a path under MEDIA_ROOT."""
    if not storage_path:
        return None

    value = storage_path.strip()
    media_marker = "/media/"
    if media_marker in value:
        relative = value.split(media_marker, maxsplit=1)[1]
    else:
        relative = value.lstrip("/")

    if not relative or ".." in relative or relative.startswith(("/", "\\")):
        return None
    return relative


def is_public_media_path(relative: str) -> bool:
    return any(relative.startswith(prefix) for prefix in PUBLIC_MEDIA_PREFIXES)


def open_stored_file(storage_path: str) -> FileResponse:
    relative = media_relative_path(storage_path)
    if relative is None or not default_storage.exists(relative):
        raise Http404("File not found.")

    handle = default_storage.open(relative, "rb")
    filename = Path(relative).name
    response = FileResponse(handle, as_attachment=True, filename=filename)
    return response


def serve_public_media(request: HttpRequest, path: str) -> HttpResponse:
    """DEBUG-only static media handler that refuses private prefixes."""
    if not settings.DEBUG:
        raise Http404()
    if ".." in path or path.startswith(("/", "\\")) or not is_public_media_path(path):
        raise Http404()
    return serve(request, path, document_root=settings.MEDIA_ROOT)
