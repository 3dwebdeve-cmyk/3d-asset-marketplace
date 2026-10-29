"""Content inspection and fail-closed ClamAV INSTREAM scanning."""
import json
import socket
import struct
from pathlib import PurePosixPath

from django.conf import settings
from django.core.exceptions import ValidationError

# ValidationError codes, so callers can tell an infected file from a scanner outage.
SCAN_MALWARE_FOUND = "malware_found"
SCAN_UNAVAILABLE = "scanner_unavailable"


def _scan_error(message, code):
    return ValidationError({"file": ValidationError(message, code=code)})


def scan_error_code(error):
    """SCAN_MALWARE_FOUND, SCAN_UNAVAILABLE or None for any other ValidationError."""
    for errors in getattr(error, "error_dict", {}).values():
        for item in errors:
            if item.code in (SCAN_MALWARE_FOUND, SCAN_UNAVAILABLE):
                return item.code
    return None


def scan_upload(uploaded):
    required = getattr(settings, "PACKAGE_SCAN_REQUIRED", False)
    host = getattr(settings, "PACKAGE_SCAN_HOST", "")
    if not host:
        if required:
            raise _scan_error("Malware scanning is unavailable. Upload rejected.", SCAN_UNAVAILABLE)
        return
    try:
        uploaded.seek(0)
        with socket.create_connection((host, settings.PACKAGE_SCAN_PORT), timeout=30) as connection:
            connection.sendall(b"zINSTREAM\0")
            for chunk in uploaded.chunks(chunk_size=65536):
                connection.sendall(struct.pack("!I", len(chunk)) + chunk)
            connection.sendall(struct.pack("!I", 0))
            response = b""
            while b"\0" not in response and len(response) < 4096:
                chunk = connection.recv(4096)
                if not chunk:
                    break
                response += chunk
            verdict = response.rstrip(b"\0\n")
            if verdict != b"stream: OK":
                # "stream: <signature> FOUND" is malware; anything else (an ERROR reply,
                # an empty one) means the scan did not complete.
                code = SCAN_MALWARE_FOUND if verdict.endswith(b" FOUND") else SCAN_UNAVAILABLE
                raise _scan_error("Malware scan did not approve this file.", code)
    except OSError as exc:
        raise _scan_error(
            "Malware scanning is unavailable. Upload rejected.", SCAN_UNAVAILABLE
        ) from exc
    finally:
        uploaded.seek(0)


def gltf_triangle_count(document):
    """Triangles drawn by every mesh primitive (instanced meshes counted once)."""
    accessors = document.get("accessors") or []
    total = 0
    for mesh in document.get("meshes") or []:
        for primitive in mesh.get("primitives") or []:
            accessor_index = primitive.get("indices")
            if accessor_index is None:
                accessor_index = (primitive.get("attributes") or {}).get("POSITION")
            if accessor_index is None:
                continue
            count = int(accessors[accessor_index]["count"])
            mode = primitive.get("mode", 4)
            if mode == 4:  # TRIANGLES
                total += count // 3
            elif mode in (5, 6):  # TRIANGLE_STRIP, TRIANGLE_FAN
                total += max(count - 2, 0)
    return total


def inspect_product_content(uploaded, extension, *, scan=True):
    """Validate content against its extension. Returns the triangle count for glTF.

    ``scan=False`` runs every structure check but skips the virus scan; only the catalog
    import uses it, when CATALOG_IMPORT_SCAN_REQUIRED is off and no scanner is configured.
    """
    from plugins.upload_rules import _validate_zip_metadata, validate_plugin_file_upload

    triangles = None
    try:
        uploaded.seek(0)
        header = uploaded.read(32)
        uploaded.seek(0)
        if extension in {".zip", ".rar", ".7z"}:
            validate_plugin_file_upload(uploaded)
            return
        if extension == ".usdz":
            _validate_zip_metadata(uploaded)
        elif extension in {".glb", ".gltf"}:
            if extension == ".glb":
                if len(header) < 20:
                    raise ValueError()
                magic, version, length, chunk_size, chunk_type = struct.unpack("<4sIIII", header[:20])
                if magic != b"glTF" or version != 2 or length != uploaded.size or chunk_type != 0x4E4F534A or chunk_size > length - 20:
                    raise ValueError()
                uploaded.seek(20)
                document = json.loads(uploaded.read(chunk_size))
                # Every remaining chunk must have a complete, aligned payload.
                while uploaded.tell() < length:
                    chunk_header = uploaded.read(8)
                    if len(chunk_header) != 8:
                        raise ValueError()
                    remaining_size, _ = struct.unpack("<II", chunk_header)
                    if remaining_size % 4 or remaining_size > length - uploaded.tell():
                        raise ValueError()
                    uploaded.seek(remaining_size, 1)
            else:
                document = json.load(uploaded)
            if not isinstance(document, dict) or document.get("asset", {}).get("version") != "2.0":
                raise ValueError()
            for entry in document.get("buffers", []) + document.get("images", []):
                uri = entry.get("uri", "")
                path = PurePosixPath(uri.replace("\\", "/"))
                if uri and not uri.startswith("data:") and (":" in uri or path.is_absolute() or ".." in path.parts or uri.startswith("//")):
                    raise ValueError()
            triangles = gltf_triangle_count(document)
        elif extension == ".blend":
            if not header.startswith(b"BLENDER"):
                raise ValueError()
        elif extension == ".fbx":
            if not (header.startswith(b"Kaydara FBX Binary") or header.startswith(b"; FBX")):
                raise ValueError()
        elif extension == ".obj":
            text = uploaded.read().decode("utf-8")
            if not any(line.strip().startswith("v ") for line in text.splitlines()):
                raise ValueError()
        if scan:
            scan_upload(uploaded)
    except (ValueError, TypeError, KeyError, IndexError, AttributeError, UnicodeError, struct.error, RecursionError) as exc:
        raise ValidationError({"file": "File content is invalid or does not match its format."}) from exc
    finally:
        uploaded.seek(0)
    return triangles
