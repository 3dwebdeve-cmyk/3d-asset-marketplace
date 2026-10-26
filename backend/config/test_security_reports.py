"""The browser security-report endpoint accepts the formats browsers actually send."""

import json

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

LEGACY = {
    "csp-report": {
        "document-uri": "https://assethive3d.com/cart",
        "blocked-uri": "https://static.example.test/beacon.js",
        "violated-directive": "script-src-elem",
    }
}
REPORTING_API = [
    {
        "type": "csp-violation",
        "url": "https://assethive3d.com/cart",
        "body": {
            "documentURL": "https://assethive3d.com/cart",
            "blockedURL": "https://accounts.google.com/gsi/style",
            "effectiveDirective": "style-src-elem",
        },
    }
]


class CspReportEndpointTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.url = reverse("csp-report")

    def _post(self, payload, content_type: str):
        body = payload if isinstance(payload, (bytes, str)) else json.dumps(payload)
        return self.client.generic("POST", self.url, body, content_type=content_type)

    def test_report_uri_content_type_is_accepted_and_logged(self) -> None:
        with self.assertLogs("security.csp", level="WARNING") as logs:
            response = self._post(LEGACY, "application/csp-report")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertIn("document=https://assethive3d.com/cart", logs.output[0])
        self.assertIn("blocked=https://static.example.test/beacon.js", logs.output[0])
        self.assertIn("directive=script-src-elem", logs.output[0])

    def test_reporting_api_list_is_accepted_and_logged(self) -> None:
        with self.assertLogs("security.csp", level="WARNING") as logs:
            response = self._post(REPORTING_API, "application/reports+json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertIn("blocked=https://accounts.google.com/gsi/style", logs.output[0])
        self.assertIn("directive=style-src-elem", logs.output[0])

    def test_plain_json_is_still_accepted(self) -> None:
        with self.assertLogs("security.csp", level="WARNING"):
            response = self._post(LEGACY, "application/json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_a_report_cannot_forge_extra_log_lines(self) -> None:
        payload = {
            "csp-report": {
                "document-uri": "https://assethive3d.com/\nWARNING fake entry",
                "blocked-uri": "x\r\ny",
                "violated-directive": "script-src",
            }
        }
        with self.assertLogs("security.csp", level="WARNING") as logs:
            self._post(payload, "application/csp-report")

        self.assertEqual(len(logs.output), 1)
        self.assertNotIn("\n", logs.output[0])

    def test_only_the_first_reports_in_a_batch_are_logged(self) -> None:
        batch = REPORTING_API * 25
        with self.assertLogs("security.csp", level="WARNING") as logs:
            response = self._post(batch, "application/reports+json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(len(logs.output), 10)

    def test_oversized_body_is_refused_before_parsing(self) -> None:
        huge = json.dumps({"csp-report": {"document-uri": "x" * 40_000}})

        response = self._post(huge, "application/csp-report")

        self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    def test_broken_json_is_a_client_error_not_a_crash(self) -> None:
        response = self._post("{not json", "application/csp-report")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_other_content_types_are_still_refused(self) -> None:
        response = self._post("hello", "text/plain")

        self.assertEqual(response.status_code, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

    def test_a_report_with_unexpected_shape_is_ignored(self) -> None:
        response = self._post(["just", "strings"], "application/reports+json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
