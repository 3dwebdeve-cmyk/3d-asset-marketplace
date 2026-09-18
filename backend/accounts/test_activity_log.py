"""Tests for durable ActivityLog persistence and admin list API."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ActivityLog, Role, User
from accounts.security_log import log_admin_action
from categories.models import Category
from products.models import Product


class ActivityLogPersistTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin = User.objects.create_user(
            email="activity-admin@example.com",
            full_name="Activity Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff", "updated_at"])
        self.customer = User.objects.create_user(
            email="activity-customer@example.com",
            full_name="Activity Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.category = Category.objects.create(name="Props", slug="props-activity")
        self.product = Product.objects.create(
            category=self.category,
            name="Audit Sword",
            slug="audit-sword",
            price=Decimal("10.00"),
            status=Product.Status.DRAFT,
        )
        self.admin_login_url = reverse("accounts:admin-login")
        self.login_url = reverse("accounts:login")
        self.list_url = reverse("accounts_activity_admin:admin-activity-logs")
        self.product_detail_url = reverse(
            "products_admin:admin-product-detail",
            kwargs={"product_id": self.product.pk},
        )

    def _authenticate_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_customer(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.customer.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_log_admin_action_persists_row(self) -> None:
        log_admin_action(
            action="unit_test_action",
            actor_id=str(self.admin.pk),
            target_id="target-1",
        )
        row = ActivityLog.objects.get(action="unit_test_action")
        self.assertEqual(row.actor_id, self.admin.pk)
        self.assertEqual(row.target_id, "target-1")
        self.assertEqual(row.metadata, {})

    def test_log_admin_action_db_failure_is_fail_soft(self) -> None:
        with patch(
            "accounts.models.ActivityLog.objects.create",
            side_effect=RuntimeError("db down"),
        ):
            # Must not raise.
            log_admin_action(
                action="fail_soft_action",
                actor_id=str(self.admin.pk),
                target_id="x",
            )

    def test_product_archive_creates_activity_log(self) -> None:
        self._authenticate_admin()
        response = self.client.delete(self.product_detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.ARCHIVED)

        row = ActivityLog.objects.get(action="product_archive")
        self.assertEqual(row.actor_id, self.admin.pk)
        self.assertEqual(row.target_id, str(self.product.pk))

    def test_activity_log_list_requires_administrator(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_activity_log_list_and_filter(self) -> None:
        log_admin_action(
            action="product_archive",
            actor_id=str(self.admin.pk),
            target_id=str(self.product.pk),
        )
        log_admin_action(
            action="user_create",
            actor_id=str(self.admin.pk),
            target_id=str(self.customer.pk),
        )
        self._authenticate_admin()

        all_rows = self.client.get(self.list_url)
        self.assertEqual(all_rows.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(all_rows.data["count"], 2)

        filtered = self.client.get(self.list_url, {"action": "product_archive"})
        self.assertEqual(filtered.status_code, status.HTTP_200_OK)
        self.assertEqual(filtered.data["count"], 1)
        item = filtered.data["results"][0]
        self.assertEqual(item["action"], "product_archive")
        self.assertEqual(item["target_id"], str(self.product.pk))
        self.assertEqual(item["actor"]["id"], str(self.admin.pk))
        self.assertEqual(item["actor"]["email"], self.admin.email)
