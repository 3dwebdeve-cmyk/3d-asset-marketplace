"""Phase 2 regression tests: archive size checks must not trust declared headers."""

import io
from unittest.mock import patch
from zipfile import ZipFile

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from plugins import upload_rules


def _zip_bytes(payload: bytes) -> bytes:
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("model/data.bin", payload)
    return buffer.getvalue()


class ZipExpansionLimitTests(SimpleTestCase):
    def test_archive_within_limit_is_accepted(self) -> None:
        upload = SimpleUploadedFile("pack.zip", _zip_bytes(b"a" * 50))
        with patch.object(upload_rules, "PLUGIN_ARCHIVE_MAX_UNCOMPRESSED_BYTES", 100):
            upload_rules._validate_zip_metadata(upload)

    def test_declared_size_over_limit_is_rejected(self) -> None:
        upload = SimpleUploadedFile("pack.zip", _zip_bytes(b"a" * 500))
        with patch.object(upload_rules, "PLUGIN_ARCHIVE_MAX_UNCOMPRESSED_BYTES", 100):
            with self.assertRaises(ValidationError):
                upload_rules._validate_zip_metadata(upload)

    def test_forged_small_declared_size_still_hits_the_real_limit(self) -> None:
        # The central directory claims 1 byte, but the entry really expands to 500.
        original_infolist = ZipFile.infolist

        def forged_infolist(self):
            entries = original_infolist(self)
            for entry in entries:
                entry.file_size = 1
            return entries

        upload = SimpleUploadedFile("pack.zip", _zip_bytes(b"a" * 500))
        with patch.object(upload_rules, "PLUGIN_ARCHIVE_MAX_UNCOMPRESSED_BYTES", 100), patch.object(
            ZipFile, "infolist", forged_infolist
        ):
            with self.assertRaises(ValidationError):
                upload_rules._validate_zip_metadata(upload)
