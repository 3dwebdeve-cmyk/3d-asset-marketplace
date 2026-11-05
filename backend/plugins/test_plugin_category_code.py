"""Plugin category codes (used in PLG-<CODE>-NNNNNN IDs), and what the public storefront shows."""

from __future__ import annotations

from decimal import Decimal

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import AuthenticationService
from plugins.models import Plugin, PluginCategory, PluginFile


class PluginCategoryCodeTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        admin = User.objects.create_user(
            email="category-code-admin@example.com",
            full_name="Category Admin",
            password="Category-Strong-Pass-2026!",
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        access = AuthenticationService.build_tokens(admin, mfa=True)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.list_url = reverse("plugin_categories_admin:admin-plugin-categories")

    def test_create_with_a_code_stores_it_in_capitals(self) -> None:
        response = self.client.post(self.list_url, {"name": "Animation", "code": "ani"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["code"], "ANI")
        self.assertEqual(PluginCategory.objects.get(slug="animation").code, "ANI")

    def test_create_without_a_code_leaves_it_empty(self) -> None:
        response = self.client.post(self.list_url, {"name": "Misc"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertIsNone(response.data["code"])

    def test_a_bad_code_is_refused(self) -> None:
        for bad in ("AN", "AN1", "ANIM", "A-N"):
            response = self.client.post(self.list_url, {"name": f"Bad {bad}", "code": bad}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)

    def test_a_code_can_be_used_by_only_one_category(self) -> None:
        self.client.post(self.list_url, {"name": "Animation", "code": "ANI"}, format="json")
        response = self.client.post(self.list_url, {"name": "Animals", "code": "ANI"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_code_can_be_set_later_and_cleared(self) -> None:
        category = PluginCategory.objects.create(name="Rigging", slug="rigging")
        detail = reverse("plugin_categories_admin:admin-plugin-category-detail", args=[category.pk])

        set_it = self.client.patch(detail, {"code": "RIG"}, format="json")
        self.assertEqual(set_it.status_code, status.HTTP_200_OK, set_it.data)
        category.refresh_from_db()
        self.assertEqual(category.code, "RIG")

        cleared = self.client.patch(detail, {"code": ""}, format="json")
        self.assertEqual(cleared.status_code, status.HTTP_200_OK, cleared.data)
        category.refresh_from_db()
        self.assertIsNone(category.code)

    def test_code_cannot_change_once_the_category_has_plugins(self) -> None:
        category = PluginCategory.objects.create(name="Rigging", slug="rigging", code="RIG")
        Plugin.objects.create(
            category=category,
            name="Bone Tool",
            slug="bone-tool",
            plugin_id="PLG-RIG-000001",
            price=Decimal("0.00"),
            status=Plugin.Status.PENDING_REVIEW,
        )
        detail = reverse("plugin_categories_admin:admin-plugin-category-detail", args=[category.pk])

        response = self.client.patch(detail, {"code": "BON"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        category.refresh_from_db()
        self.assertEqual(category.code, "RIG")


class StorefrontVisibilityTests(APITestCase):
    """Plugins waiting for review or rejected must never appear on the public shop."""

    def setUp(self) -> None:
        cache.clear()
        category = PluginCategory.objects.create(name="Animation", slug="animation", code="ANI")
        for plugin_id, plugin_status in (
            ("PLG-ANI-000001", Plugin.Status.PUBLISHED),
            ("PLG-ANI-000002", Plugin.Status.PENDING_REVIEW),
            ("PLG-ANI-000003", Plugin.Status.REJECTED),
            ("PLG-ANI-000004", Plugin.Status.DRAFT),
        ):
            plugin = Plugin.objects.create(
                category=category,
                name=f"Plugin {plugin_id[-1]}",
                slug=f"plugin-{plugin_id[-1]}",
                plugin_id=plugin_id,
                price=Decimal("5.00"),
                status=plugin_status,
            )
            PluginFile.objects.create(
                plugin=plugin,
                file_name="x.zip",
                file_format="zip",
                file_size=1,
                storage_path=f"plugins/{plugin_id}/{plugin_id}.zip",
                is_primary=True,
            )

    def test_only_published_plugins_are_listed(self) -> None:
        response = self.client.get(reverse("plugins:plugin-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = {row["slug"] for row in response.data["results"]}
        self.assertEqual(slugs, {"plugin-1"})

    def test_a_pending_plugin_cannot_be_opened_by_slug(self) -> None:
        response = self.client.get(reverse("plugins:plugin-detail", args=["plugin-2"]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_rejected_plugin_cannot_be_opened_by_slug(self) -> None:
        response = self.client.get(reverse("plugins:plugin-detail", args=["plugin-3"]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
