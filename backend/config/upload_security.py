"""Content inspection and fail-closed ClamAV INSTREAM scanning."""
import json
import socket
import struct
from pathlib import PurePosixPath

from django.conf import settings
from django.core.exceptions import ValidationError


def scan_upload(uploaded):
    required = getattr(settings, "PACKAGE_SCAN_REQUIRED", False)
    host = getattr(settings, "PACKAGE_SCAN_HOST", "")
    if not host:
        if required:
            raise ValidationError({"file": "Malware scanning is unavailable. Upload rejected."})
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
            if response.rstrip(b"\0\n") != b"stream: OK":
                raise ValidationError({"file": "Malware scan did not approve this file."})
    except OSError as exc:
        raise ValidationError({"file": "Malware scanning is unavailable. Upload rejected."}) from exc
    finally:
        uploaded.seek(0)


def inspect_product_content(uploaded, extension):
    from plugins.upload_rules import _validate_zip_metadata, validate_plugin_file_upload

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
                    remaining_size, remaining_type = struct.unpack("<II", chunk_header)
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
        scan_upload(uploaded)
    except (ValueError, TypeError, KeyError, AttributeError, UnicodeError, struct.error, RecursionError) as exc:
        raise ValidationError({"file": "File content is invalid or does not match its format."}) from exc
    finally:
        uploaded.seek(0)
