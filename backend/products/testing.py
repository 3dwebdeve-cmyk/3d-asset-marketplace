"""Test fixtures shared by product tests (not imported by application code)."""

from __future__ import annotations

import json
import struct
from pathlib import PurePosixPath

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
    """Upload each item's preview GLB, as the batch pipeline does before an import."""
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


def put_pipeline_packages(items: list[dict]) -> None:
    """Upload each item's package zip, as the batch pipeline does before an import."""
    for item in items:
        key = str((item.get("media") or {}).get("package_key") or "")
        if key.lower().endswith(".zip") and ".." not in key and not default_storage.exists(key):
            default_storage.save(key, ContentFile(b"PK\x05\x06" + b"\x00" * 18))


def put_pipeline_objects(items: list[dict], *, triangles: int = 100) -> None:
    """Upload every object the pipeline puts on R2 before calling the import."""
    put_pipeline_previews(items, triangles=triangles)
    put_pipeline_packages(items)
