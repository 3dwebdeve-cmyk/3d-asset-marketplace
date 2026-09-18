"""OpenAPI schema generation smoke test."""

from __future__ import annotations

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APIClient


class OpenAPISchemaTests(SimpleTestCase):
    def test_schema_endpoint_returns_openapi(self) -> None:
        client = APIClient()
        response = client.get(reverse("schema"), {"format": "json"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("openapi", "")[:2], "3.")
        self.assertIn("paths", payload)
        self.assertIn("/api/v1/auth/register/", payload["paths"])
