from decimal import Decimal

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from custom_projects.models import CustomProject
from plugins.models import Plugin, PluginCategory
from products.models import Product


class AdminDashboardStatsAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")

        self.admin_user = User.objects.create_user(
            email="admin-stats@example.com",
            full_name="Admin Stats",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="customer-stats@example.com",
            full_name="Customer Stats",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.furniture = Category.objects.create(
            name="Furniture",
            slug="furniture",
            is_active=True,
        )
        self.archived_category = Category.objects.create(
            name="Legacy",
            slug="legacy",
            is_active=False,
        )
        Product.objects.create(
            category=self.furniture,
            name="Oak Chair",
            slug="oak-chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )
        Product.objects.create(
            category=self.furniture,
            name="Hidden Desk",
            slug="hidden-desk",
            price=Decimal("99.00"),
            status=Product.Status.DRAFT,
        )
        plugin_category = PluginCategory.objects.create(
            name="Blender",
            slug="blender",
        )
        Plugin.objects.create(
            category=plugin_category,
            name="Mesh Toolkit",
            slug="mesh-toolkit",
            price=Decimal("20.00"),
        )
        CustomProject.objects.create(
            customer=self.customer_user,
            title="Pending crate",
            description="Awaiting admin review for a stylized crate request.",
            status=CustomProject.Status.SUBMITTED,
        )
        CustomProject.objects.create(
            customer=self.customer_user,
            title="Live armor set",
            description="Approved custom armor modeling work in progress.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        CustomProject.objects.create(
            customer=self.customer_user,
            title="Finished weapon",
            description="Completed custom weapon deliverable for the client.",
            status=CustomProject.Status.COMPLETED,
        )

        self.stats_url = reverse("analytics_admin:admin-dashboard-stats")
        self.admin_login_url = reverse("accounts:admin-login")

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_stats_requires_administrator(self) -> None:
        response = self.client.get(self.stats_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.get(self.stats_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_stats_returns_marketplace_counts(self) -> None:
        self._authenticate_as_admin()

        response = self.client.get(self.stats_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["users"]["total"], 2)
        self.assertGreaterEqual(response.data["users"]["active"], 2)
        self.assertEqual(response.data["products"]["total"], 2)
        self.assertEqual(response.data["products"]["published"], 1)
        self.assertEqual(response.data["products"]["draft"], 1)
        self.assertEqual(response.data["products"]["archived"], 0)
        self.assertEqual(response.data["categories"]["total"], 2)
        self.assertEqual(response.data["categories"]["live"], 1)
        self.assertEqual(response.data["plugins"]["total"], 1)
        self.assertEqual(response.data["projects"]["pending"], 1)
        self.assertEqual(response.data["projects"]["live"], 1)
        self.assertEqual(response.data["projects"]["completed"], 1)
        self.assertEqual(response.data["sales"]["monthly_revenue"], "0.00")
        self.assertEqual(response.data["sales"]["monthly_orders"], 0)
        self.assertEqual(response.data["sales"]["currency"], "USD")
        self.assertEqual(response.data["payments"]["succeeded"], 0)
        self.assertEqual(response.data["payments"]["pending"], 0)
        self.assertEqual(len(response.data["category_breakdown"]), 1)
        self.assertEqual(response.data["category_breakdown"][0]["slug"], "furniture")
        self.assertEqual(response.data["category_breakdown"][0]["product_count"], 2)
        self.assertEqual(
            response.data["category_breakdown"][0]["published_product_count"],
            1,
        )
