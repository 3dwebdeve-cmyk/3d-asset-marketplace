from pathlib import Path
import tempfile

from django.core.files.storage import default_storage, storages
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import Http404
from django.test import SimpleTestCase, override_settings

from config.media import media_relative_path, open_stored_file
from config.storages import build_public_media_url, get_private_storage, get_public_storage
from products.storage import ProductMediaStorageService


def _storages(public_dir: str, private_dir: str) -> dict:
    return {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
        "public": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": public_dir},
        },
        "private": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": private_dir},
        },
    }


class MediaPathTests(SimpleTestCase):
    def test_legacy_media_url_and_relative_key(self) -> None:
        self.assertEqual(
            media_relative_path("http://127.0.0.1:8000/media/products/files/a.zip"),
            "products/files/a.zip",
        )
        self.assertEqual(
            media_relative_path("products/files/a.zip"),
            "products/files/a.zip",
        )
        self.assertIsNone(media_relative_path("../secret.zip"))

    @override_settings(R2_PUBLIC_BASE_URL="https://pub-test.r2.dev")
    def test_strips_public_r2_base_url(self) -> None:
        self.assertEqual(
            media_relative_path("https://pub-test.r2.dev/products/images/x.png"),
            "products/images/x.png",
        )


class DualStorageRoutingTests(SimpleTestCase):
    def setUp(self) -> None:
        self.public_dir = tempfile.mkdtemp()
        self.private_dir = tempfile.mkdtemp()

    def test_public_uploads_use_cdn_url_private_uploads_store_keys(self) -> None:
        with override_settings(
            R2_ENABLED=True,
            R2_PUBLIC_BASE_URL="https://pub-test.r2.dev",
            STORAGES=_storages(self.public_dir, self.private_dir),
        ):
            image = SimpleUploadedFile("thumb.png", b"png-bytes", content_type="image/png")
            image_url = ProductMediaStorageService.save_image("pid", image, ".png")
            self.assertTrue(image_url.startswith("https://pub-test.r2.dev/products/images/"))
            image_key = media_relative_path(image_url)
            self.assertIsNotNone(image_key)
            self.assertTrue(get_public_storage().exists(image_key))
            self.assertFalse(get_private_storage().exists(image_key))
            self.assertFalse(Path(self.private_dir, image_key).exists())

            package = SimpleUploadedFile(
                "pack.zip",
                b"zip-bytes",
                content_type="application/zip",
            )
            stored_key = ProductMediaStorageService.save_file("pid", package, ".zip")
            self.assertTrue(stored_key.startswith("products/files/"))
            self.assertNotIn("r2.dev", stored_key)
            self.assertNotIn("/media/", stored_key)
            self.assertTrue(get_private_storage().exists(stored_key))
            self.assertFalse(get_public_storage().exists(stored_key))
            self.assertTrue(Path(self.private_dir, stored_key).is_file())

            response = open_stored_file(stored_key)
            body = b"".join(response.streaming_content)
            response.close()
            self.assertEqual(body, b"zip-bytes")

            ProductMediaStorageService.delete_if_managed(
                stored_key,
                prefix=ProductMediaStorageService.FILE_PREFIX,
            )
            self.assertFalse(get_private_storage().exists(stored_key))

    def test_local_fallback_public_url_still_uses_media_path(self) -> None:
        self.assertFalse(
            build_public_media_url("products/images/x.png").startswith("https://pub-")
        )
        self.assertIn("/media/products/images/x.png", build_public_media_url("products/images/x.png"))
        self.assertIs(get_public_storage(), default_storage)
        self.assertIs(get_private_storage(), default_storage)

    def test_open_missing_private_key_is_404(self) -> None:
        with self.assertRaises(Http404):
            open_stored_file("products/files/missing/nope.zip")


class StorageHandlerReloadTests(SimpleTestCase):
    """Named storages must pick up override_settings(STORAGES=...)."""

    def test_named_public_alias_exists(self) -> None:
        storages["public"]
        storages["private"]
