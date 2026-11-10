"""GET /api/v1/admin/products/<id>/price-history/ — read-only price history for administrators."""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import AuthenticationService
from categories.models import Category
from products.models import Product, ProductPriceChange
from products.price_history import PriceState, record_price_change

PASSWORD = "History-Strong-Pass-2026!"

EXPECTED_FIELDS = {
    "id",
    "source",
    "source_label",
    "batch_id",
    "currency",
    "old_price",
    "new_price",
    "old_discount_price",
    "new_discount_price",
    "old_discount_ends_at",
    "new_discount_ends_at",
    "created_at",
    "changed_by",
}


class AdminProductPriceHistoryTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin = User.objects.create_user(
            email="history-admin@example.com",
            full_name="History Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.customer = User.objects.create_user(
            email="history-customer@example.com",
            full_name="Customer",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        category = Category.objects.create(name="Chairs", slug="chairs")
        self.product = Product.objects.create(
            category=category,
            name="Chair",
            slug=Product.build_slug("Chair"),
            price=Decimal("10.00"),
            status=Product.Status.PUBLISHED,
        )
        self.url = self._url(self.product.pk)

    def _url(self, product_id) -> str:
        return reverse("products_admin:admin-product-price-history", kwargs={"product_id": product_id})

    def _login(self, user: User, *, mfa: bool = True) -> None:
        access = AuthenticationService.build_tokens(user, mfa=mfa)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _row(self, **fields) -> ProductPriceChange:
        data = {
            "product": self.product,
            "source": ProductPriceChange.Source.ADMIN_EDIT,
            "old_price": Decimal("10.00"),
            "new_price": Decimal("12.00"),
        }
        data.update(fields)
        return ProductPriceChange.objects.create(**data)

    def test_rows_newest_first(self) -> None:
        now = timezone.now()
        old = self._row()
        new = self._row()
        mid = self._row()
        for row, age in ((old, 3), (mid, 2), (new, 1)):
            ProductPriceChange.objects.filter(pk=row.pk).update(created_at=now - timedelta(hours=age))
        self._login(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [str(new.pk), str(mid.pk), str(old.pk)])

    def test_only_this_products_rows(self) -> None:
        other = Product.objects.create(
            category=self.product.category,
            name="Table",
            slug=Product.build_slug("Table"),
            price=Decimal("5.00"),
            status=Product.Status.PUBLISHED,
        )
        self._row()
        ProductPriceChange.objects.create(
            product=other, source=ProductPriceChange.Source.IMPORT, new_price=Decimal("5.00")
        )
        self._login(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(len(response.data["results"]), 1)

    def test_limited_to_latest_100(self) -> None:
        now = timezone.now()
        ProductPriceChange.objects.bulk_create(
            [
                ProductPriceChange(
                    product=self.product,
                    source=ProductPriceChange.Source.PRICING_PAGE,
                    new_price=Decimal(i + 1),
                )
                for i in range(105)
            ]
        )
        for index, row in enumerate(ProductPriceChange.objects.filter(product=self.product)):
            ProductPriceChange.objects.filter(pk=row.pk).update(created_at=now - timedelta(minutes=index))
        self._login(self.admin)

        response = self.client.get(self.url)

        results = response.data["results"]
        self.assertEqual(len(results), 100)
        stamps = [row["created_at"] for row in results]
        self.assertEqual(stamps, sorted(stamps, reverse=True))

    def test_changed_by_null_and_set(self) -> None:
        self._row(source=ProductPriceChange.Source.IMPORT)
        self._row(changed_by=self.admin)
        self._login(self.admin)

        results = self.client.get(self.url).data["results"]

        by_source = {row["source"]: row for row in results}
        self.assertIsNone(by_source["import"]["changed_by"])
        self.assertEqual(
            by_source["admin_edit"]["changed_by"],
            {"id": str(self.admin.pk), "full_name": "History Admin", "email": "history-admin@example.com"},
        )

    def test_fields_and_format(self) -> None:
        ends = timezone.now() + timedelta(days=3)
        before = PriceState.of(self.product)
        self.product.price = Decimal("12.50")
        self.product.discount_price = Decimal("9.00")
        self.product.discount_ends_at = ends
        self.product.save()
        record_price_change(
            self.product,
            before,
            source=ProductPriceChange.Source.PRICING_PAGE,
            actor=self.admin,
            batch_id="batch-1",
        )
        self._login(self.admin)

        row = self.client.get(self.url).data["results"][0]

        self.assertEqual(set(row), EXPECTED_FIELDS)
        self.assertEqual(row["source"], "pricing_page")
        self.assertEqual(row["source_label"], "Pricing page")
        self.assertEqual(row["batch_id"], "batch-1")
        self.assertEqual(row["currency"], "USD")
        self.assertEqual(row["old_price"], "10.00")
        self.assertEqual(row["new_price"], "12.50")
        self.assertIsNone(row["old_discount_price"])
        self.assertEqual(row["new_discount_price"], "9.00")
        self.assertIsNone(row["old_discount_ends_at"])
        self.assertIsNotNone(row["new_discount_ends_at"])
        self.assertTrue(row["created_at"].endswith("Z") or "+" in row["created_at"], row["created_at"])

    def test_empty_history(self) -> None:
        self._login(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"results": []})

    def test_no_n_plus_one(self) -> None:
        other_admin = User.objects.create_user(
            email="history-admin2@example.com",
            full_name="Second Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        for actor in (self.admin, other_admin, self.admin, other_admin, None):
            self._row(changed_by=actor)
        self._login(self.admin)

        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.url)

        self.assertEqual(len(response.data["results"]), 5)
        history_queries = [q for q in queries if "product_price_changes" in q["sql"]]
        self.assertEqual(len(history_queries), 1)
        user_queries = [q for q in queries if 'FROM "users"' in q["sql"] and "product_price_changes" not in q["sql"]]
        self.assertLessEqual(len(user_queries), 2, [q["sql"] for q in user_queries])

    def test_unknown_product_is_404(self) -> None:
        self._login(self.admin)

        response = self.client.get(self._url(uuid.uuid4()))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_is_refused(self) -> None:
        self._login(self.customer, mfa=False)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_is_refused(self) -> None:
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(ADMIN_MFA_REQUIRED=True)
    def test_admin_without_mfa_token_is_refused(self) -> None:
        self._login(self.admin, mfa=False)

        response = self.client.get(self.url)

        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
