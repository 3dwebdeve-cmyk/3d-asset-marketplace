from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.throttles import WishlistWriteRateThrottle
from categories.models import Category
from plugins.models import Plugin, PluginCategory
from products.models import Product
from wishlist.models import WishlistItem


class WishlistAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.customer = User.objects.create_user(
            email="customer@example.com",
            full_name="Test Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="other@example.com",
            full_name="Other Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.published_product = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            short_description="A wooden chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )
        self.draft_product = Product.objects.create(
            category=self.category,
            name="Hidden Desk",
            slug="hidden-desk",
            price=Decimal("99.00"),
            status=Product.Status.DRAFT,
        )
        self.archived_product = Product.objects.create(
            category=self.category,
            name="Old Lamp",
            slug="old-lamp",
            price=Decimal("15.00"),
            status=Product.Status.ARCHIVED,
        )

        self.plugin_category = PluginCategory.objects.create(
            name="Tools",
            slug="tools",
            is_active=True,
        )
        self.published_plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="UV Toolkit",
            slug="uv-toolkit",
            short_description="UV tools",
            price=Decimal("19.99"),
            status=Plugin.Status.PUBLISHED,
        )
        self.draft_plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="Hidden Plugin",
            slug="hidden-plugin",
            price=Decimal("9.99"),
            status=Plugin.Status.DRAFT,
        )

        self.list_url = reverse("wishlist:wishlist-list-create")
        self.login_url = reverse("accounts:login")

    def authenticate(self, user: User | None = None) -> None:
        target = user or self.customer
        login = self.client.post(
            self.login_url,
            {"email": target.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_unauthenticated_requests_return_401(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        add = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.published_product.pk),
            },
            format="json",
        )
        self.assertEqual(add.status_code, status.HTTP_401_UNAUTHORIZED)

        delete = self.client.delete(
            reverse("wishlist:wishlist-detail", kwargs={"item_id": uuid4()}),
        )
        self.assertEqual(delete.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_returns_paginated_wishlist_with_catalog(self) -> None:
        WishlistItem.objects.create(
            user=self.customer,
            product_type=WishlistItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
        )
        self.authenticate()

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        item = response.data["results"][0]
        self.assertEqual(item["product_type"], "product")
        self.assertEqual(item["product_id"], str(self.published_product.pk))
        self.assertEqual(item["catalog"]["slug"], "oak-chair")
        self.assertTrue(item["catalog"]["is_available"])

    def test_list_filters_by_product_type(self) -> None:
        WishlistItem.objects.create(
            user=self.customer,
            product_type=WishlistItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
        )
        WishlistItem.objects.create(
            user=self.customer,
            product_type=WishlistItem.ProductType.PLUGIN,
            product_id=self.published_plugin.pk,
        )
        self.authenticate()

        response = self.client.get(self.list_url, {"product_type": "plugin"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["product_type"], "plugin")

    def test_list_rejects_invalid_product_type_filter(self) -> None:
        self.authenticate()
        response = self.client.get(self.list_url, {"product_type": "invalid"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product_type", response.data)

    def test_add_published_product_returns_201(self) -> None:
        self.authenticate()
        response = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.published_product.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["product_type"], "product")
        self.assertEqual(response.data["catalog"]["name"], "Oak Chair")
        self.assertTrue(
            WishlistItem.objects.filter(
                user=self.customer,
                product_type="product",
                product_id=self.published_product.pk,
            ).exists()
        )

    def test_add_published_plugin_returns_201(self) -> None:
        self.authenticate()
        response = self.client.post(
            self.list_url,
            {
                "product_type": "plugin",
                "product_id": str(self.published_plugin.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["product_type"], "plugin")
        self.assertEqual(response.data["catalog"]["slug"], "uv-toolkit")

    def test_add_is_idempotent(self) -> None:
        self.authenticate()
        payload = {
            "product_type": "product",
            "product_id": str(self.published_product.pk),
        }
        first = self.client.post(self.list_url, payload, format="json")
        second = self.client.post(self.list_url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(
            WishlistItem.objects.filter(
                user=self.customer,
                product_type="product",
                product_id=self.published_product.pk,
            ).count(),
            1,
        )

    def test_add_rejects_draft_archived_and_missing_items(self) -> None:
        self.authenticate()
        cases = [
            ("product", self.draft_product.pk),
            ("product", self.archived_product.pk),
            ("plugin", self.draft_plugin.pk),
            ("product", uuid4()),
        ]
        for product_type, product_id in cases:
            response = self.client.post(
                self.list_url,
                {"product_type": product_type, "product_id": str(product_id)},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("product_id", response.data)

    def test_add_rejects_plugin_with_inactive_category(self) -> None:
        inactive_category = PluginCategory.objects.create(
            name="Inactive",
            slug="inactive",
            is_active=False,
        )
        plugin = Plugin.objects.create(
            category=inactive_category,
            name="Inactive Plugin",
            slug="inactive-plugin",
            price=Decimal("5.00"),
            status=Plugin.Status.PUBLISHED,
        )
        self.authenticate()
        response = self.client.post(
            self.list_url,
            {"product_type": "plugin", "product_id": str(plugin.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product_id", response.data)

    def test_remove_own_item_returns_204(self) -> None:
        item = WishlistItem.objects.create(
            user=self.customer,
            product_type=WishlistItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
        )
        self.authenticate()
        url = reverse("wishlist:wishlist-detail", kwargs={"item_id": item.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WishlistItem.objects.filter(pk=item.pk).exists())

    def test_remove_other_users_item_returns_404(self) -> None:
        item = WishlistItem.objects.create(
            user=self.other_customer,
            product_type=WishlistItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
        )
        self.authenticate(self.customer)
        url = reverse("wishlist:wishlist-detail", kwargs={"item_id": item.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(WishlistItem.objects.filter(pk=item.pk).exists())

    def test_remove_unknown_item_returns_404(self) -> None:
        self.authenticate()
        url = reverse("wishlist:wishlist-detail", kwargs={"item_id": uuid4()})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch.object(WishlistWriteRateThrottle, "rate", "1/min", create=True)
    def test_write_endpoints_are_rate_limited(self) -> None:
        self.authenticate()
        payload = {
            "product_type": "product",
            "product_id": str(self.published_product.pk),
        }
        first = self.client.post(self.list_url, payload, format="json")
        second = self.client.post(self.list_url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second.data.get("code"), "throttled")

    def test_list_shows_unavailable_catalog_for_archived_product(self) -> None:
        item = WishlistItem.objects.create(
            user=self.customer,
            product_type=WishlistItem.ProductType.PRODUCT,
            product_id=self.archived_product.pk,
        )
        self.authenticate()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(row for row in response.data["results"] if row["id"] == str(item.pk))
        self.assertFalse(row["catalog"]["is_available"])
