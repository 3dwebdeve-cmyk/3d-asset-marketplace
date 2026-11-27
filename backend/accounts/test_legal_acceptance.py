"""Legal acceptance API and service tests."""

from __future__ import annotations

from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.legal_service import (
    LegalAcceptanceService,
    acceptances_for_email,
    email_digest,
)
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


VERSIONS = {"terms": "2026-09-18", "privacy": "2026-09-18"}


class LegalAcceptanceSurvivesUserDeleteTests(TestCase):
    """Acceptance proof must outlive the account (legal claims)."""

    def make_user(self, email: str) -> User:
        user = User.objects.create_user(
            email=email,
            full_name="Deleted Later",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        LegalAcceptanceService.record_acceptances(user, VERSIONS)
        return user

    def test_rows_record_the_account_id(self) -> None:
        user = self.make_user("ref@example.com")
        refs = set(LegalAcceptance.objects.filter(user=user).values_list("user_ref", flat=True))
        self.assertEqual(refs, {user.pk})

    def test_deleting_the_user_keeps_the_rows(self) -> None:
        user = self.make_user("Gone@Example.com")
        user_id = user.pk
        user.delete()

        rows = LegalAcceptance.objects.filter(user_ref=user_id)
        self.assertEqual(
            set(rows.values_list("document_key", "version")),
            {("terms", "2026-09-18"), ("privacy", "2026-09-18")},
        )
        for row in rows:
            self.assertIsNone(row.user_id)
            self.assertEqual(row.email_sha256, email_digest("gone@example.com"))

    def test_queryset_delete_also_keeps_the_rows(self) -> None:
        # Django admin's "delete selected" deletes through a queryset.
        user = self.make_user("bulk@example.com")
        user_id = user.pk
        User.objects.filter(pk=user_id).delete()
        self.assertEqual(
            LegalAcceptance.objects.filter(
                user_ref=user_id, email_sha256=email_digest("bulk@example.com")
            ).count(),
            2,
        )

    def test_other_users_rows_are_untouched(self) -> None:
        gone = self.make_user("gone2@example.com")
        kept = self.make_user("kept@example.com")
        gone.delete()
        for row in LegalAcceptance.objects.filter(user=kept):
            self.assertEqual(row.email_sha256, "")

    def test_lookup_by_email_finds_live_and_deleted_accounts(self) -> None:
        self.make_user("live@example.com")
        self.make_user("deleted@example.com").delete()

        self.assertEqual(acceptances_for_email("LIVE@example.com ").count(), 2)
        self.assertEqual(acceptances_for_email("Deleted@Example.com").count(), 2)
        self.assertEqual(acceptances_for_email("nobody@example.com").count(), 0)

        out = StringIO()
        call_command("find_legal_acceptances", email="deleted@example.com", stdout=out)
        self.assertIn("terms 2026-09-18", out.getvalue())
        self.assertIn("deleted account", out.getvalue())
