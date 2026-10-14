"""Test fixtures shared by product tests (not imported by application code)."""

from __future__ import annotations

import json
import struct

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage


def make_glb_bytes(triangles: int = 0) -> bytes:
    """Minimal valid GLB whose single mesh draws ``triangles`` triangles."""
    document: dict = {"asset": {"version": "2.0"}}
    if triangles:
        document["accessors"] = [{"count": triangles * 3, "componentType": 5125, "type": "SCALAR"}]
        document["meshes"] = [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 0}]}]
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    return struct.pack("<4sIIII", b"glTF", 2, 20 + len(payload), len(payload), 0x4E4F534A) + payload


def put_pipeline_previews(items: list[dict], *, triangles: int = 100) -> None:
    """Upload each item's preview.glb, as the batch pipeline does before an import."""
    for item in items:
        key = str((item.get("media") or {}).get("preview_key") or "")
        if key.endswith("/preview.glb") and ".." not in key and not default_storage.exists(key):
            default_storage.save(key, ContentFile(make_glb_bytes(triangles)))
