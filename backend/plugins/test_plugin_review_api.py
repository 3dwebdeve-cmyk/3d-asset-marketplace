"""Admin review endpoints: approve (set price), reject (with reason), requeue."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ActivityLog, Role, User
from plugins.models import Plugin, PluginCategory, PluginFile

PASSWORD = "Review-Strong-Pass-2026!"


class PluginReviewApiTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.category = PluginCategory.objects.create(name="Animation", slug="animation", code="ANI")
        self.admin = User.objects.create_user(
            email="plugin-review-admin@example.com",
            full_name="Plugin Review Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.customer = User.objects.create_user(
            email="plugin-review-customer@example.com",
            full_name="Customer",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        self.plugin = self._pending("PLG-ANI-000001")

    def _pending(self, plugin_id: str, status_value: str = Plugin.Status.PENDING_REVIEW) -> Plugin:
        plugin = Plugin.objects.create(
            category=self.category,
            name="Rig Helper",
            slug=plugin_id.lower(),
            plugin_id=plugin_id,
            description="Helps with rigs.",
            thumbnail="https://cdn.example.com/rig.webp",
            price=Decimal("0.00"),
            import_batch_id="batch-1",
            status=status_value,
        )
        PluginFile.objects.create(
            plugin=plugin,
            file_name=f"{plugin_id}.zip",
            file_format="zip",
            file_size=10,
            storage_path=f"plugins/{plugin_id}/{plugin_id}.zip",
            is_primary=True,
        )
        return plugin

    def _login_as_admin(self) -> None:
        # Admin API calls need the MFA-verified token, as in the other admin tests.
        from accounts.services import AuthenticationService

        access = AuthenticationService.build_tokens(self.admin, mfa=True)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _url(self, plugin: Plugin, action: str) -> str:
        return reverse(f"plugins_admin:admin-plugin-{action}", args=[plugin.pk])

    def test_approve_sets_the_price_and_records_the_reviewer(self) -> None:
        self._login_as_admin()
        with patch("plugins.services.private_object_exists", return_value=True):
            response = self.client.post(
                self._url(self.plugin, "approve"),
                {"price": "24.50", "qa_notes": "Checked on 2026 Max"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.PUBLISHED)
        self.assertEqual(self.plugin.price, Decimal("24.50"))
        self.assertEqual(self.plugin.reviewed_by, self.admin)
        self.assertEqual(self.plugin.qa_notes, "Checked on 2026 Max")
        self.assertTrue(ActivityLog.objects.filter(action="plugin_approve").exists())

    def test_approve_with_zero_makes_it_free(self) -> None:
        self._login_as_admin()
        with patch("plugins.services.private_object_exists", return_value=True):
            response = self.client.post(self._url(self.plugin, "approve"), {"price": "0"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.price, Decimal("0.00"))

    def test_negative_price_is_refused(self) -> None:
        self._login_as_admin()
        with patch("plugins.services.private_object_exists", return_value=True):
            response = self.client.post(self._url(self.plugin, "approve"), {"price": "-5"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.PENDING_REVIEW)

    def test_reject_requires_a_reason_and_then_requeue_returns_it(self) -> None:
        self._login_as_admin()
        blank = self.client.post(self._url(self.plugin, "reject"), {"reason": "   "}, format="json")
        self.assertEqual(blank.status_code, status.HTTP_400_BAD_REQUEST)

        rejected = self.client.post(
            self._url(self.plugin, "reject"), {"reason": "Thumbnail is blurry"}, format="json"
        )
        self.assertEqual(rejected.status_code, status.HTTP_200_OK, rejected.data)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.REJECTED)
        self.assertEqual(self.plugin.reject_reason, "Thumbnail is blurry")

        requeued = self.client.post(self._url(self.plugin, "requeue"), {}, format="json")
        self.assertEqual(requeued.status_code, status.HTTP_200_OK, requeued.data)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.PENDING_REVIEW)

    def test_approve_refuses_a_plugin_that_is_not_pending(self) -> None:
        self._login_as_admin()
        published = self._pending("PLG-ANI-000002", Plugin.Status.PUBLISHED)
        with patch("plugins.services.private_object_exists", return_value=True):
            response = self.client.post(self._url(published, "approve"), {"price": "5"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_approve_refuses_when_the_package_is_missing(self) -> None:
        self._login_as_admin()
        with patch("plugins.services.private_object_exists", return_value=False):
            response = self.client.post(self._url(self.plugin, "approve"), {"price": "5"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.PENDING_REVIEW)

    def test_customer_cannot_review(self) -> None:
        from accounts.services import AuthenticationService

        access = AuthenticationService.build_tokens(self.customer)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.post(self._url(self.plugin, "approve"), {"price": "0"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.PENDING_REVIEW)

    def test_anonymous_cannot_review(self) -> None:
        response = self.client.post(self._url(self.plugin, "reject"), {"reason": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
