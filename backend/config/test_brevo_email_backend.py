"""Tests for Brevo HTTP API email backend."""

from __future__ import annotations

import json
from io import BytesIO
from unittest.mock import MagicMock, patch

from django.core.mail import EmailMessage, send_mail
from django.test import SimpleTestCase, override_settings

from config.brevo_email_backend import (
    BrevoAPIEmailBackend,
    BrevoAPIError,
    _split_from_email,
)


class SplitFromEmailTests(SimpleTestCase):
    def test_plain_address(self) -> None:
        self.assertEqual(_split_from_email("a@b.com"), ("", "a@b.com"))

    def test_name_angle_address(self) -> None:
        self.assertEqual(
            _split_from_email("Shop <noreply@example.com>"),
            ("Shop", "noreply@example.com"),
        )


@override_settings(
    BREVO_API_KEY="test-brevo-key",
    DEFAULT_FROM_EMAIL="webmaster@c-design.in",
    EMAIL_BACKEND="config.brevo_email_backend.BrevoAPIEmailBackend",
)
class BrevoAPIEmailBackendTests(SimpleTestCase):
    def test_send_posts_json_to_brevo(self) -> None:
        mock_response = MagicMock()
        mock_response.status = 201
        mock_response.read.return_value = b'{"messageId":"x"}'
        mock_response.__enter__.return_value = mock_response
        mock_response.__exit__.return_value = False

        with patch(
            "config.brevo_email_backend.urlopen",
            return_value=mock_response,
        ) as mock_urlopen:
            sent = send_mail(
                "Hello",
                "Body text",
                None,
                ["user@example.com"],
                fail_silently=False,
            )

        self.assertEqual(sent, 1)
        request = mock_urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(request.get_header("Api-key"), "test-brevo-key")
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["sender"]["email"], "webmaster@c-design.in")
        self.assertEqual(payload["to"], [{"email": "user@example.com"}])
        self.assertEqual(payload["subject"], "Hello")
        self.assertEqual(payload["textContent"], "Body text")

    def test_missing_api_key_raises(self) -> None:
        with override_settings(BREVO_API_KEY=""):
            backend = BrevoAPIEmailBackend(fail_silently=False)
            message = EmailMessage("S", "B", "a@b.com", ["c@d.com"])
            with self.assertRaises(BrevoAPIError):
                backend.send_messages([message])

    def test_http_error_surfaces(self) -> None:
        from urllib.error import HTTPError

        err = HTTPError(
            url="https://api.brevo.com/v3/smtp/email",
            code=401,
            msg="Unauthorized",
            hdrs=None,
            fp=BytesIO(b'{"message":"Key not found"}'),
        )
        with patch("config.brevo_email_backend.urlopen", side_effect=err):
            with self.assertRaises(BrevoAPIError) as ctx:
                send_mail("S", "B", None, ["u@example.com"], fail_silently=False)
        self.assertIn("401", str(ctx.exception))
