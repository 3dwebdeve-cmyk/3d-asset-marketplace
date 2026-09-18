"""Legal acceptance API and service tests."""

from __future__ import annotations

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.legal_service import LegalAcceptanceService
from accounts.models import LegalAcceptance, Role, User


@override_settings(
    LEGAL_DOCUMENT_VERSIONS={"terms": "2026-09-18", "privacy": "2026-09-18"},
)
class LegalAcceptanceAPITests(APITestCase):
    def setUp(self) -> None:
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="legal-user@example.com",
            full_name="Legal User",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.documents_url = reverse("accounts:legal-documents")
        self.accept_url = reverse("accounts:legal-acceptances")
        self.register_url = reverse("accounts:register")

    def test_public_legal_documents_lists_versions(self) -> None:
        response = self.client.get(self.documents_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["versions"],
            {"terms": "2026-09-18", "privacy": "2026-09-18"},
        )

    def test_register_requires_accepted_legal(self) -> None:
        response = self.client.post(
            self.register_url,
            {
                "full_name": "No Legal",
                "email": "no-legal@example.com",
                "password": self.password,
                "password_confirm": self.password,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("accepted_legal", response.data)
        self.assertFalse(User.objects.filter(email="no-legal@example.com").exists())

    def test_register_records_legal_acceptances(self) -> None:
        response = self.client.post(
            self.register_url,
            {
                "full_name": "With Legal",
                "email": "with-legal@example.com",
                "password": self.password,
                "password_confirm": self.password,
                "accepted_legal": {
                    "terms": "2026-09-18",
                    "privacy": "2026-09-18",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="with-legal@example.com")
        keys = set(
            LegalAcceptance.objects.filter(user=user).values_list(
                "document_key", "version"
            )
        )
        self.assertEqual(
            keys,
            {("terms", "2026-09-18"), ("privacy", "2026-09-18")},
        )

    def test_authenticated_accept_records_rows(self) -> None:
        self.client.force_authenticate(self.user)
        response = self.client.post(
            self.accept_url,
            {
                "accepted_legal": {
                    "terms": "2026-09-18",
                    "privacy": "2026-09-18",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["accepted"])
        self.assertEqual(LegalAcceptanceService.missing_for_user(self.user), {})
