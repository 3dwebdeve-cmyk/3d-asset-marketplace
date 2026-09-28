"""OpenAPI schema generation smoke test."""

from __future__ import annotations

from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "openapi-tests",
        }
    }
)
class OpenAPISchemaTests(SimpleTestCase):
    @override_settings(DEBUG=True)
    def test_schema_endpoint_returns_openapi(self) -> None:
        client = APIClient()
        response = client.get(reverse("schema"), {"format": "json"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("openapi", "")[:2], "3.")
        self.assertIn("paths", payload)
        self.assertIn("/api/v1/auth/register/", payload["paths"])

    @override_settings(DEBUG=False)
    def test_schema_requires_admin_when_debug_false(self) -> None:
        client = APIClient()
        response = client.get(reverse("schema"), {"format": "json"})
        self.assertIn(response.status_code, {401, 403})
