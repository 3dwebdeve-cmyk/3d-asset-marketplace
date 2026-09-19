"""Unit tests for Phase C1 R2 private presign smoke."""

from __future__ import annotations

from io import StringIO
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings

from config.r2_smoke import R2SmokeError, run_private_presign_smoke


class R2PresignSmokeTests(SimpleTestCase):
    @override_settings(R2_ENABLED=False)
    def test_smoke_requires_r2_enabled(self) -> None:
        with self.assertRaises(R2SmokeError):
            run_private_presign_smoke()

    @override_settings(
        R2_ENABLED=True,
        R2_PRIVATE_BUCKET="priv-test",
        R2_SIGNED_URL_EXPIRY=300,
    )
    @patch("config.r2_smoke.urlopen")
    @patch("config.r2_smoke.resolve_private_download")
    @patch("config.r2_smoke.private_s3_client")
    def test_smoke_presign_happy_path(
        self,
        mock_client_factory,
        mock_resolve,
        mock_urlopen,
    ) -> None:
        client = mock_client_factory.return_value
        mock_resolve.return_value = {
            "download_url": "https://example.r2.dev/signed",
            "expires_in": 300,
            "file_name": "r2-smoke.bin",
        }
        response = MagicMock()
        response.read.return_value = b"3dam-r2-smoke"
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        mock_urlopen.return_value = response

        result = run_private_presign_smoke()

        self.assertTrue(result.signed_json_ok)
        self.assertTrue(result.storage_path_omitted)
        self.assertEqual(result.expires_in, 300)
        self.assertTrue(result.fetch_ok)
        self.assertTrue(result.cleaned_up)
        client.put_object.assert_called_once()
        client.delete_object.assert_called_once()
        mock_resolve.assert_called_once()
        self.assertNotIn("storage_path", mock_resolve.return_value)

    @override_settings(
        R2_ENABLED=True,
        R2_PRIVATE_BUCKET="priv-test",
    )
    @patch("config.r2_smoke.resolve_private_download")
    @patch("config.r2_smoke.private_s3_client")
    def test_smoke_rejects_storage_path_in_json(
        self,
        mock_client_factory,
        mock_resolve,
    ) -> None:
        mock_client_factory.return_value
        mock_resolve.return_value = {
            "download_url": "https://example.r2.dev/signed",
            "expires_in": 300,
            "storage_path": "secret/key.bin",
        }
        with self.assertRaises(R2SmokeError) as ctx:
            run_private_presign_smoke()
        self.assertIn("storage_path", str(ctx.exception))


class VerifyR2SmokeCommandTests(SimpleTestCase):
    @override_settings(R2_ENABLED=False)
    def test_verify_r2_smoke_flag_still_fails_when_disabled(self) -> None:
        with self.assertRaises(CommandError):
            call_command("verify_r2", smoke_presign=True)

    @override_settings(
        R2_ENABLED=True,
        R2_PUBLIC_BUCKET="pub-test",
        R2_PRIVATE_BUCKET="priv-test",
        R2_ENDPOINT_URL="https://example.r2.cloudflarestorage.com",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
    )
    @patch("products.management.commands.verify_r2.run_private_presign_smoke")
    @patch("products.management.commands.verify_r2.verify_r2_buckets")
    def test_verify_r2_runs_smoke_after_heads(
        self,
        mock_verify,
        mock_smoke,
    ) -> None:
        mock_verify.return_value = {"public": "ok", "private": "ok"}
        mock_smoke.return_value = MagicMock(
            signed_json_ok=True,
            storage_path_omitted=True,
            expires_in=300,
            fetch_ok=True,
            cleaned_up=True,
        )
        out = StringIO()
        call_command("verify_r2", smoke_presign=True, stdout=out)
        mock_verify.assert_called_once()
        mock_smoke.assert_called_once()
