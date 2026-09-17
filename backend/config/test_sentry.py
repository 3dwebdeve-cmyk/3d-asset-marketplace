from __future__ import annotations

from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from config.sentry import before_send, capture_webhook_failure


class SentryScrubberTests(SimpleTestCase):
    def test_before_send_scrubs_auth_headers_cookies_and_emails(self) -> None:
        event = {
            "message": "User jane@example.com failed with Bearer abc.def.ghi",
            "request": {
                "headers": {
                    "Authorization": "Bearer secret-token",
                    "Cookie": "sessionid=abc",
                    "Content-Type": "application/json",
                },
                "cookies": {"sessionid": "abc"},
                "data": {"password": "hunter2"},
                "query_string": "token=abc&page=1",
                "url": "https://api.example/webhook?token=abc&page=1",
            },
            "user": {
                "id": "42",
                "email": "jane@example.com",
                "username": "jane",
                "ip_address": "1.2.3.4",
            },
            "exception": {
                "values": [
                    {
                        "value": "bad token eyJhbGciOiJIUzI1NiJ9.aaa.bbb for jane@example.com",
                        "stacktrace": {
                            "frames": [
                                {
                                    "vars": {
                                        "password": "hunter2",
                                        "safe": "ok",
                                        "note": "mail jane@example.com",
                                    }
                                }
                            ]
                        },
                    }
                ]
            },
        }

        result = before_send(event, {})
        assert result is not None

        request = result["request"]
        self.assertEqual(request["headers"]["Authorization"], "[Filtered]")
        self.assertEqual(request["headers"]["Cookie"], "[Filtered]")
        self.assertEqual(request["headers"]["Content-Type"], "application/json")
        self.assertEqual(request["cookies"], "[Filtered]")
        self.assertEqual(request["data"], "[Filtered]")
        self.assertEqual(request["query_string"], "token=[Filtered]&page=1")
        self.assertIn("token=[Filtered]", request["url"])
        self.assertNotIn("jane@example.com", result["message"])
        self.assertEqual(result["user"]["email"], "[Filtered]")
        self.assertEqual(result["user"]["username"], "[Filtered]")
        self.assertEqual(result["user"]["ip_address"], "[Filtered]")
        self.assertEqual(result["user"]["id"], "42")

        frame_vars = result["exception"]["values"][0]["stacktrace"]["frames"][0]["vars"]
        self.assertEqual(frame_vars["password"], "[Filtered]")
        self.assertEqual(frame_vars["safe"], "ok")
        self.assertNotIn("jane@example.com", frame_vars["note"])
        self.assertNotIn("eyJhbGciOiJIUzI1NiJ9", result["exception"]["values"][0]["value"])


class StripeWebhookSentryTests(APITestCase):
    def setUp(self) -> None:
        self.webhook_url = reverse("payments:webhook")

    @override_settings(STRIPE_WEBHOOK_SECRET="")
    @patch("payments.views.capture_webhook_failure")
    def test_missing_secret_reports_to_sentry(
        self,
        capture: object,
    ) -> None:
        response = self.client.post(
            self.webhook_url,
            data=b"{}",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        capture.assert_called_once()  # type: ignore[attr-defined]
        kwargs = capture.call_args.kwargs  # type: ignore[attr-defined]
        self.assertEqual(kwargs["reason"], "secret_missing")

    @override_settings(STRIPE_WEBHOOK_SECRET="whsec_test")
    @patch("payments.views.capture_webhook_failure")
    @patch("payments.views.stripe.Webhook.construct_event")
    def test_invalid_signature_reports_to_sentry(
        self,
        construct_event: object,
        capture: object,
    ) -> None:
        import stripe

        construct_event.side_effect = stripe.error.SignatureVerificationError(  # type: ignore[attr-defined]
            "bad sig",
            "sig_header",
        )
        response = self.client.post(
            self.webhook_url,
            data=b"{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=bad",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        capture.assert_called_once()  # type: ignore[attr-defined]
        self.assertEqual(capture.call_args.kwargs["reason"], "invalid_signature")  # type: ignore[attr-defined]

    @override_settings(STRIPE_WEBHOOK_SECRET="whsec_test")
    @patch("payments.views.capture_webhook_failure")
    @patch("payments.views.WebhookService.handle_event")
    @patch("payments.views.stripe.Webhook.construct_event")
    def test_handler_exception_reports_and_returns_500(
        self,
        construct_event: object,
        handle_event: object,
        capture: object,
    ) -> None:
        event = type("Event", (), {"id": "evt_1", "type": "checkout.session.completed"})()
        construct_event.return_value = event  # type: ignore[attr-defined]
        handle_event.side_effect = RuntimeError("boom")  # type: ignore[attr-defined]

        response = self.client.post(
            self.webhook_url,
            data=b"{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=ok",
        )
        self.assertEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        capture.assert_called_once()  # type: ignore[attr-defined]
        self.assertEqual(capture.call_args.kwargs["reason"], "handler_exception")  # type: ignore[attr-defined]


class CaptureWebhookFailureTests(SimpleTestCase):
    @patch("config.sentry.sentry_sdk.capture_message")
    def test_capture_message_is_invoked(self, capture_message: object) -> None:
        capture_webhook_failure("missing secret", reason="secret_missing")
        capture_message.assert_called_once_with("missing secret", level="error")  # type: ignore[attr-defined]
