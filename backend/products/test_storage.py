from pathlib import Path
import tempfile
from unittest.mock import patch

from django.core.files.storage import default_storage, storages
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import Http404
from django.test import RequestFactory, SimpleTestCase, override_settings

from config.media import (
    is_batch_private_object,
    is_public_media_path,
    media_relative_path,
    open_stored_file,
    serve_public_media,
)
from config.storages import (
    R2_CLIENT_RETRY_ATTEMPTS,
    boto_retry_config,
    build_public_media_url,
    call_with_storage_retries,
    content_disposition_filename,
    generate_private_presigned_url,
    get_private_storage,
    get_public_storage,
    is_retryable_storage_error,
    signed_url_expiry_seconds,
)
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

    def test_cache_busting_query_is_not_part_of_the_key(self) -> None:
        self.assertEqual(
            media_relative_path("http://127.0.0.1:8000/media/models/M/preview_M.glb?v=0123456789ab"),
            "models/M/preview_M.glb",
        )

    def test_batch_ingest_public_keys_exclude_package(self) -> None:
        self.assertTrue(is_public_media_path("models/MDL-000142/thumbnail.jpg"))
        self.assertTrue(is_public_media_path("models/MDL-000142/preview.glb"))
        self.assertTrue(is_public_media_path("models/MDL-000142/gallery/01.jpg"))
        self.assertFalse(is_public_media_path("models/MDL-000142/package.zip"))
        self.assertFalse(is_public_media_path("products/files/a.zip"))
        self.assertTrue(is_public_media_path("products/images/x.png"))

    def test_any_zip_under_models_is_private(self) -> None:
        # The 3ds Max pipeline names the package <Model_ID>.zip.
        for key in (
            "models/FUR-CHR-000123/package.zip",
            "models/FUR-CHR-000123/FUR-CHR-000123.zip",
            "models/FUR-CHR-000123/Other.ZIP",
        ):
            with self.subTest(key=key):
                self.assertTrue(is_batch_private_object(key))
                self.assertFalse(is_public_media_path(key))
        for name in (
            "preview_FUR-CHR-000123.glb",
            "previewthumb_FUR-CHR-000123.jpg",
            "gallery.png",
            "gallery.webp",
        ):
            key = f"models/FUR-CHR-000123/{name}"
            with self.subTest(key=key):
                self.assertFalse(is_batch_private_object(key))
                self.assertTrue(is_public_media_path(key))

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


class SignedUrlHelperTests(SimpleTestCase):
    def test_expiry_is_clamped(self) -> None:
        with override_settings(R2_SIGNED_URL_EXPIRY=12):
            self.assertEqual(signed_url_expiry_seconds(), 60)
        with override_settings(R2_SIGNED_URL_EXPIRY=99999):
            self.assertEqual(signed_url_expiry_seconds(), 3600)
        with override_settings(R2_SIGNED_URL_EXPIRY=300):
            self.assertEqual(signed_url_expiry_seconds(), 300)

    def test_content_disposition_filename_strips_quotes_and_newlines(self) -> None:
        self.assertEqual(content_disposition_filename('pack".zip\n'), "pack.zip")
        self.assertEqual(content_disposition_filename("   "), "download")

    def test_presign_requires_r2(self) -> None:
        with override_settings(R2_ENABLED=False):
            with self.assertRaises(RuntimeError):
                generate_private_presigned_url("products/files/a.zip", file_name="a.zip")

    @override_settings(
        R2_ENABLED=True,
        R2_ENDPOINT_URL="https://acc.r2.cloudflarestorage.com",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
        R2_PRIVATE_BUCKET="3dam-private",
        R2_SIGNED_URL_EXPIRY=180,
    )
    @patch("config.storages.boto3.client")
    def test_presign_uses_private_bucket_and_expiry(self, mock_client) -> None:
        mock_client.return_value.generate_presigned_url.return_value = (
            "https://acc.r2.cloudflarestorage.com/3dam-private/products/files/a.zip?X-Amz-Signature=abc"
        )
        url = generate_private_presigned_url("products/files/a.zip", file_name='hero.zip')
        self.assertTrue(url.startswith("https://"))
        self.assertNotIn("storage_path", url)
        mock_client.return_value.generate_presigned_url.assert_called_once()
        _, kwargs = mock_client.return_value.generate_presigned_url.call_args
        self.assertEqual(kwargs["ExpiresIn"], 180)
        self.assertEqual(kwargs["Params"]["Bucket"], "3dam-private")
        self.assertEqual(kwargs["Params"]["Key"], "products/files/a.zip")
        self.assertIn("attachment; filename=", kwargs["Params"]["ResponseContentDisposition"])
        config = mock_client.call_args.kwargs["config"]
        self.assertEqual(config.retries["max_attempts"], R2_CLIENT_RETRY_ATTEMPTS)

    def test_boto_retry_config_uses_standard_mode(self) -> None:
        config = boto_retry_config()
        self.assertEqual(config.retries["max_attempts"], R2_CLIENT_RETRY_ATTEMPTS)
        self.assertEqual(config.retries["mode"], "standard")

    def test_storage_retries_transient_errors(self) -> None:
        calls = {"n": 0}

        def flaky() -> str:
            calls["n"] += 1
            if calls["n"] < 3:
                raise OSError("temporary")
            return "ok"

        self.assertEqual(call_with_storage_retries(flaky), "ok")
        self.assertEqual(calls["n"], 3)

    def test_non_retryable_client_error_is_not_retried(self) -> None:
        from botocore.exceptions import ClientError

        error = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "no"}, "ResponseMetadata": {"HTTPStatusCode": 403}},
            "GetObject",
        )
        self.assertFalse(is_retryable_storage_error(error))
        with self.assertRaises(ClientError):
            call_with_storage_retries(lambda: (_ for _ in ()).throw(error), attempts=3)


class StorageHandlerReloadTests(SimpleTestCase):
    """Named storages must pick up override_settings(STORAGES=...)."""

    def test_named_public_alias_exists(self) -> None:
        storages["public"]
        storages["private"]


class PipelinePackageServingTests(SimpleTestCase):
    """The DEBUG media server and local streaming keep <Model_ID>.zip private."""

    def test_debug_media_server_refuses_pipeline_package(self) -> None:
        media_root = Path(tempfile.mkdtemp())
        folder = media_root / "models" / "FUR-CHR-000123"
        folder.mkdir(parents=True)
        (folder / "FUR-CHR-000123.zip").write_bytes(b"PK")
        (folder / "preview_FUR-CHR-000123.glb").write_bytes(b"glTF")

        with override_settings(DEBUG=True, MEDIA_ROOT=str(media_root)):
            preview = "models/FUR-CHR-000123/preview_FUR-CHR-000123.glb"
            response = serve_public_media(RequestFactory().get(f"/media/{preview}"), preview)
            self.assertEqual(response.status_code, 200)

            package = "models/FUR-CHR-000123/FUR-CHR-000123.zip"
            with self.assertRaises(Http404):
                serve_public_media(RequestFactory().get(f"/media/{package}"), package)

    def test_local_streaming_reads_pipeline_package_from_private_storage(self) -> None:
        public_dir = tempfile.mkdtemp()
        private_dir = tempfile.mkdtemp()
        with override_settings(
            R2_ENABLED=True,
            R2_PUBLIC_BASE_URL="https://pub-test.r2.dev",
            STORAGES=_storages(public_dir, private_dir),
        ):
            key = "models/FUR-CHR-000123/FUR-CHR-000123.zip"
            get_private_storage().save(key, SimpleUploadedFile("p.zip", b"PK"))
            self.assertFalse(get_public_storage().exists(key))
            response = open_stored_file(key)
            body = b"".join(response.streaming_content)
            response.close()
            self.assertEqual(body, b"PK")

