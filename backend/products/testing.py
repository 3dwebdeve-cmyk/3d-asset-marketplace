"""Test fixtures shared by product tests (not imported by application code)."""

from __future__ import annotations

import json
import struct
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image


def make_glb_bytes(triangles: int = 0) -> bytes:
    """Minimal valid GLB whose single mesh draws ``triangles`` triangles."""
    document: dict = {"asset": {"version": "2.0"}}
    if triangles:
        document["accessors"] = [{"count": triangles * 3, "componentType": 5125, "type": "SCALAR"}]
        document["meshes"] = [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 0}]}]
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    return struct.pack("<4sIIII", b"glTF", 2, 20 + len(payload), len(payload), 0x4E4F534A) + payload


_IMAGE_FORMATS = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}


def make_image_bytes(extension: str) -> bytes:
    """A tiny valid image in the format the extension names."""
    output = BytesIO()
    Image.new("RGB", (8, 8), color=(120, 90, 60)).save(output, format=_IMAGE_FORMATS[extension])
    return output.getvalue()


def put_pipeline_images(items: list[dict]) -> None:
    """Upload each item's thumbnail and gallery images, as the batch pipeline does.

    The import reads them from storage before it creates the product.
    """
    for item in items:
        media = item.get("media") or {}
        image_keys = [media.get("thumbnail_key"), *(media.get("gallery_keys") or [])]
        for image_key in (str(k or "") for k in image_keys):
            extension = "." + image_key.rsplit(".", 1)[-1].lower() if "." in image_key else ""
            if (
                image_key.startswith("models/")
                and ".." not in image_key
                and extension in _IMAGE_FORMATS
                and not default_storage.exists(image_key)
            ):
                default_storage.save(image_key, ContentFile(make_image_bytes(extension)))


def put_pipeline_uploads(items: list[dict], *, triangles: int = 100) -> None:
    """Upload each item's preview, thumbnail and gallery images, as the batch pipeline does."""
    for item in items:
        key = str((item.get("media") or {}).get("preview_key") or "")
        name = PurePosixPath(key).name.lower()
        # preview-<hex>.glb is the importer's own secured copy, never a pipeline upload.
        if (
            name.endswith(".glb")
            and not name.startswith("preview-")
            and ".." not in key
            and not default_storage.exists(key)
        ):
            default_storage.save(key, ContentFile(make_glb_bytes(triangles)))
    put_pipeline_images(items)
