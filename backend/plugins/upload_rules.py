"""Plugin package upload validation (extension, MIME, size, and archive integrity)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile

PLUGIN_FILE_MAX_BYTES = 50 * 1024 * 1024
PLUGIN_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
PLUGIN_ARCHIVE_MAX_ENTRIES = 10_000

PLUGIN_FILE_ALLOWED_EXTENSIONS = frozenset({".zip", ".rar", ".7z"})
PLUGIN_FILE_ALLOWED_MIME_TYPES = {
    ".zip": frozenset(
        {
            "application/zip",
            "application/x-zip-compressed",
            "application/octet-stream",
        }
    ),
    ".rar": frozenset(
        {
            "application/vnd.rar",
            "application/x-rar-compressed",
            "application/octet-stream",
        }
    ),
    ".7z": frozenset(
        {
            "application/x-7z-compressed",
            "application/octet-stream",
        }
    ),
}
_ARCHIVE_SIGNATURES = {
    ".zip": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
    ".rar": (b"Rar!\x1a\x07\x00", b"Rar!\x1a\x07\x01\x00"),
    ".7z": (b"7z\xbc\xaf\x27\x1c",),
}


@dataclass(frozen=True)
class ValidatedPluginFileUpload:
    file: UploadedFile
    extension: str
    mime_type: str
    file_format: str


def validate_plugin_file_upload(uploaded: UploadedFile) -> ValidatedPluginFileUpload:
    if not uploaded or not getattr(uploaded, "name", None):
        raise ValidationError({"file": "Plugin package is required."})

    extension = Path(uploaded.name).suffix.lower()
    if extension not in PLUGIN_FILE_ALLOWED_EXTENSIONS:
        raise ValidationError(
            {
                "file": (
                    "Invalid file extension. Allowed: "
                    f"{', '.join(sorted(PLUGIN_FILE_ALLOWED_EXTENSIONS))}."
                )
            }
        )

    declared_mime = (uploaded.content_type or "").lower().strip()
    if declared_mime and declared_mime not in PLUGIN_FILE_ALLOWED_MIME_TYPES[extension]:
        raise ValidationError({"file": "Invalid MIME type for this plugin package."})

    size = getattr(uploaded, "size", None)
    if size is None:
        raise ValidationError({"file": "Unable to determine file size."})
    if size <= 0:
        raise ValidationError({"file": "Plugin package is empty."})
    if size > PLUGIN_FILE_MAX_BYTES:
        raise ValidationError(
            {
                "file": (
                    f"Plugin package must be "
                    f"{PLUGIN_FILE_MAX_BYTES // (1024 * 1024)} MB or smaller."
                )
            }
        )

    try:
        uploaded.seek(0)
        signature = uploaded.read(8)
        if not any(signature.startswith(prefix) for prefix in _ARCHIVE_SIGNATURES[extension]):
            raise ValidationError(
                {"file": "File content does not match the archive extension."}
            )
        uploaded.seek(0)
        if extension == ".zip":
            _validate_zip_metadata(uploaded)
    finally:
        uploaded.seek(0)

    return ValidatedPluginFileUpload(
        file=uploaded,
        extension=extension,
        mime_type=declared_mime or "application/octet-stream",
        file_format=extension.removeprefix("."),
    )


def _validate_zip_metadata(uploaded: UploadedFile) -> None:
    try:
        with ZipFile(uploaded) as archive:
            entries = archive.infolist()
            if not entries:
                raise ValidationError({"file": "Plugin package cannot be empty."})
            if len(entries) > PLUGIN_ARCHIVE_MAX_ENTRIES:
                raise ValidationError({"file": "Plugin package contains too many files."})

            total_uncompressed = 0
            for entry in entries:
                if entry.flag_bits & 0x1:
                    raise ValidationError(
                        {"file": "Encrypted plugin packages are not allowed."}
                    )
                path = PurePosixPath(entry.filename.replace("\\", "/"))
                is_windows_absolute = bool(path.parts and ":" in path.parts[0])
                file_type = (entry.external_attr >> 16) & 0o170000
                if (
                    path.is_absolute()
                    or is_windows_absolute
                    or ".." in path.parts
                    or file_type == 0o120000
                ):
                    raise ValidationError(
                        {"file": "Plugin package contains an unsafe file path."}
                    )
                total_uncompressed += entry.file_size
                if total_uncompressed > PLUGIN_ARCHIVE_MAX_UNCOMPRESSED_BYTES:
                    raise ValidationError(
                        {"file": "Plugin package expands beyond the allowed size."}
                    )
    except BadZipFile as exc:
        raise ValidationError({"file": "Plugin package is not a valid ZIP archive."}) from exc
