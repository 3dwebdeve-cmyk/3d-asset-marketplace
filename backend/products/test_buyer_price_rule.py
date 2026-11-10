"""The one buyer-price rule (docs/PRICING_PIPELINE.md, "The price a buyer pays"), the admin
edit of a sale end, price history on edits, and the maintenance task that clears ended sales."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.management.commands import run_maintenance_loop
from accounts.models import Role, User
from cart.models import CartItem
from cart.services import CartService
from categories.models import Category
from config.ops_report import build_daily_report
from orders.services import OrderCreateData, OrderItemCreateData, OrderService
from products.models import Product, ProductPriceChange
from products.services import ProductService, ProductUpdateData
from products.test_catalog_import import CatalogImportTestBase, _happy_item
from wishlist.services import WishlistService

PASSWORD = "StrongPass123!"


def _product(category: Category, slug: str, **fields) -> Product:
    values = {
        "name": slug.replace("-", " ").title(),
        "price": Decimal("20.00"),
        "status": Product.Status.PUBLISHED,
    }
    values.update(fields)
    return Product.objects.create(category=category, slug=slug, **values)


class ModelRuleTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.now = timezone.now()

    def test_no_sale(self) -> None:
        product = _product(self.category, "plain")
        self.assertIsNone(product.active_discount_price(self.now))
        self.assertEqual(product.effective_price(self.now), Decimal("20.00"))

    def test_running_sale(self) -> None:
        product = _product(
            self.category,
            "running",
            discount_price=Decimal("12.00"),
            discount_ends_at=self.now + timedelta(hours=1),
        )
        self.assertEqual(product.active_discount_price(self.now), Decimal("12.00"))
        self.assertEqual(product.effective_price(self.now), Decimal("12.00"))

    def test_sale_ending_exactly_now_has_ended(self) -> None:
        product = _product(
            self.category, "edge", discount_price=Decimal("12.00"), discount_ends_at=self.now
        )
        self.assertIsNone(product.active_discount_price(self.now))
        self.assertEqual(product.effective_price(self.now), Decimal("20.00"))
        # One microsecond earlier it still runs.
        self.assertEqual(
            product.effective_price(self.now - timedelta(microseconds=1)), Decimal("12.00")
        )

    def test_sale_without_an_end_runs_until_removed(self) -> None:
        product = _product(self.category, "open", discount_price=Decimal("12.00"))
        self.assertEqual(
            product.effective_price(self.now + timedelta(days=3650)), Decimal("12.00")
        )


class BuyerPricePathsTests(TestCase):
    """Cart, checkout and wishlist charge or show only a running sale."""

    def setUp(self) -> None:
        self.customer = User.objects.create_user(
            email="buyer@example.com",
            full_name="Buyer",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.product = _product(
            self.category,
            "sale-desk",
            price=Decimal("100.00"),
            discount_price=Decimal("79.99"),
            discount_ends_at=timezone.now() + timedelta(hours=1),
        )

    def _end_the_sale(self) -> None:
        # The sale ends after the item was added; the maintenance loop has not run yet.
        Product.objects.filter(pk=self.product.pk).update(
            discount_ends_at=timezone.now() - timedelta(seconds=1)
        )

    def test_cart_snapshot_while_the_sale_runs(self) -> None:
        CartService.add_item(self.customer, "product", self.product.pk)
        envelope = CartService.get_cart_envelope(self.customer)
        snapshot = envelope.snapshots[(CartItem.ProductType.PRODUCT, self.product.pk)]
        self.assertEqual(snapshot["discount_price"], "79.99")
        self.assertEqual(snapshot["effective_price"], "79.99")
        self.assertEqual(envelope.totals.total, Decimal("79.99"))

    def test_cart_snapshot_after_the_sale_ended(self) -> None:
        CartService.add_item(self.customer, "product", self.product.pk)
        self._end_the_sale()

        envelope = CartService.get_cart_envelope(self.customer)
        snapshot = envelope.snapshots[(CartItem.ProductType.PRODUCT, self.product.pk)]
        self.assertIsNone(snapshot["discount_price"])
        self.assertEqual(snapshot["price"], "100.00")
        self.assertEqual(snapshot["effective_price"], "100.00")
        self.assertTrue(snapshot["is_available"])
        self.assertEqual(envelope.totals.total, Decimal("100.00"))

    def test_checkout_charges_the_normal_price_when_the_sale_ended_after_add_to_cart(self) -> None:
        CartService.add_item(self.customer, "product", self.product.pk)
        self._end_the_sale()

        order = OrderService.create_from_cart(self.customer)

        line = order.items.get()
        self.assertEqual(line.purchase_price, Decimal("100.00"))
        self.assertEqual(order.total_amount, Decimal("100.00"))

    def test_checkout_charges_the_sale_price_while_it_runs(self) -> None:
        CartService.add_item(self.customer, "product", self.product.pk)

        order = OrderService.create_from_cart(self.customer)

        self.assertEqual(order.items.get().purchase_price, Decimal("79.99"))

    def test_direct_order_uses_the_rule(self) -> None:
        data = OrderCreateData(
            user_id=self.customer.pk,
            items=(OrderItemCreateData("product", self.product.pk, 1),),
        )
        self.assertEqual(OrderService.create(data).items.get().purchase_price, Decimal("79.99"))

        self._end_the_sale()
        order = OrderService.create(data)
        self.assertEqual(order.items.get().purchase_price, Decimal("100.00"))
        self.assertEqual(order.total_amount, Decimal("100.00"))

    def test_wishlist_snapshot_shows_only_a_running_sale(self) -> None:
        self.assertEqual(WishlistService._product_snapshot(self.product)["discount_price"], "79.99")

        self._end_the_sale()
        self.product.refresh_from_db()
        snapshot = WishlistService._product_snapshot(self.product)
        self.assertIsNone(snapshot["discount_price"])
        self.assertEqual(snapshot["price"], "100.00")


class PublicApiTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.ends_at = timezone.now() + timedelta(days=2)
        self.running = _product(
            self.category,
            "running-sale",
            discount_price=Decimal("12.00"),
            discount_ends_at=self.ends_at,
        )
        self.ended = _product(
            self.category,
            "ended-sale",
            discount_price=Decimal("12.00"),
            discount_ends_at=timezone.now() - timedelta(minutes=1),
        )
        self.open_sale = _product(self.category, "open-sale", discount_price=Decimal("15.00"))
        self.plain = _product(self.category, "plain")

    def _rows(self) -> dict[str, dict]:
        response = self.client.get(reverse("products:product-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row["slug"]: row for row in response.json()["results"]}

    def test_list_hides_an_ended_sale_and_sends_the_end_only_while_it_runs(self) -> None:
        rows = self._rows()

        self.assertEqual(rows["running-sale"]["discount_price"], "12.00")
        self.assertEqual(parse_datetime(rows["running-sale"]["discount_ends_at"]), self.ends_at)
        self.assertIsNone(rows["ended-sale"]["discount_price"])
        self.assertIsNone(rows["ended-sale"]["discount_ends_at"])
        self.assertEqual(rows["ended-sale"]["price"], "20.00")
        self.assertEqual(rows["open-sale"]["discount_price"], "15.00")
        self.assertIsNone(rows["open-sale"]["discount_ends_at"])
        self.assertIsNone(rows["plain"]["discount_price"])
        self.assertIsNone(rows["plain"]["discount_ends_at"])

    def test_detail_hides_an_ended_sale(self) -> None:
        ended = self.client.get(reverse("products:product-detail", kwargs={"slug": "ended-sale"}))
        running = self.client.get(reverse("products:product-detail", kwargs={"slug": "running-sale"}))

        self.assertIsNone(ended.json()["discount_price"])
        self.assertIsNone(ended.json()["discount_ends_at"])
        self.assertEqual(running.json()["discount_price"], "12.00")
        self.assertEqual(parse_datetime(running.json()["discount_ends_at"]), self.ends_at)

    def test_list_query_loads_the_sale_fields(self) -> None:
        # Deferred fields would cost one query per product in the list.
        product = ProductService.list_public().get(pk=self.running.pk)
        deferred = product.get_deferred_fields()
        for name in ("price", "discount_price", "discount_ends_at", "currency"):
            self.assertNotIn(name, deferred)

    def test_list_query_count_does_not_grow_with_products(self) -> None:
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        url = reverse("products:product-list")

        def count() -> int:
            cache.clear()
            with CaptureQueriesContext(connection) as ctx:
                self.client.get(url)
            return len(ctx.captured_queries)

        count()  # warm up anything loaded once per process
        before = count()
        _product(
            self.category, "another-sale", discount_price=Decimal("1.00"), discount_ends_at=self.ends_at
        )
        self.assertEqual(count(), before)


class AdminSaleEndTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin = User.objects.create_user(
            email="pricing-admin@example.com",
            full_name="Pricing Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff", "updated_at"])
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin.email, "password": PASSWORD},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        # A draft: edits of a published model also re-run the publish checks (files etc.).
        self.product = _product(
            self.category, "admin-chair", price=Decimal("50.00"), status=Product.Status.DRAFT
        )
        self.url = reverse(
            "products_admin:admin-product-detail", kwargs={"product_id": self.product.pk}
        )

    def _patch(self, payload: dict):
        return self.client.patch(self.url, payload, format="json")

    def _future(self, **delta) -> str:
        return (timezone.now() + timedelta(**(delta or {"days": 3}))).isoformat()

    def test_sets_a_sale_with_an_end_and_records_who_did_it(self) -> None:
        ends_at = timezone.now() + timedelta(days=3)

        response = self._patch({"discount_price": "40.00", "discount_ends_at": ends_at.isoformat()})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["discount_price"], "40.00")
        self.assertEqual(parse_datetime(response.data["discount_ends_at"]), ends_at)
        self.assertTrue(response.data["discount_active"])
        change = ProductPriceChange.objects.get(product=self.product)
        self.assertEqual(change.source, ProductPriceChange.Source.ADMIN_EDIT)
        self.assertEqual(change.changed_by, self.admin)
        self.assertEqual(change.old_price, Decimal("50.00"))
        self.assertEqual(change.new_price, Decimal("50.00"))
        self.assertIsNone(change.old_discount_price)
        self.assertEqual(change.new_discount_price, Decimal("40.00"))
        self.assertIsNone(change.old_discount_ends_at)
        self.assertEqual(change.new_discount_ends_at, ends_at)

    def test_accepts_an_offset_and_stores_the_same_instant(self) -> None:
        response = self._patch(
            {"discount_price": "40.00", "discount_ends_at": "2099-12-01T18:30:00+05:30"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.discount_ends_at.isoformat(), "2099-12-01T13:00:00+00:00")

    def test_refuses_a_past_end(self) -> None:
        response = self._patch(
            {"discount_price": "40.00", "discount_ends_at": (timezone.now() - timedelta(hours=1)).isoformat()}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_ends_at", response.data)
        self.product.refresh_from_db()
        self.assertIsNone(self.product.discount_price)
        self.assertFalse(ProductPriceChange.objects.exists())

    def test_refuses_an_end_without_a_time_zone(self) -> None:
        for value in ("2099-12-01T18:30:00", "2099-12-01 18:30"):
            with self.subTest(value=value):
                response = self._patch({"discount_price": "40.00", "discount_ends_at": value})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("discount_ends_at", response.data)
        self.product.refresh_from_db()
        self.assertIsNone(self.product.discount_ends_at)

    def test_refuses_an_end_without_a_sale_price(self) -> None:
        response = self._patch({"discount_ends_at": self._future()})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_ends_at", response.data)

    def test_refuses_an_end_while_removing_the_sale_price(self) -> None:
        Product.objects.filter(pk=self.product.pk).update(discount_price=Decimal("40.00"))

        response = self._patch({"discount_price": None, "discount_ends_at": self._future()})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_ends_at", response.data)

    def test_adds_an_end_to_an_existing_sale(self) -> None:
        Product.objects.filter(pk=self.product.pk).update(discount_price=Decimal("40.00"))

        response = self._patch({"discount_ends_at": self._future()})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIsNotNone(response.data["discount_ends_at"])

    def test_clearing_the_sale_price_clears_its_end(self) -> None:
        ends_at = timezone.now() + timedelta(days=1)
        Product.objects.filter(pk=self.product.pk).update(
            discount_price=Decimal("40.00"), discount_ends_at=ends_at
        )

        response = self._patch({"discount_price": None})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIsNone(response.data["discount_price"])
        self.assertIsNone(response.data["discount_ends_at"])
        self.assertFalse(response.data["discount_active"])
        change = ProductPriceChange.objects.get(product=self.product)
        self.assertEqual(change.old_discount_price, Decimal("40.00"))
        self.assertIsNone(change.new_discount_price)
        self.assertEqual(change.old_discount_ends_at, ends_at)
        self.assertIsNone(change.new_discount_ends_at)
        self.assertEqual(change.changed_by, self.admin)

    def test_null_end_keeps_the_sale_without_an_end(self) -> None:
        Product.objects.filter(pk=self.product.pk).update(
            discount_price=Decimal("40.00"), discount_ends_at=timezone.now() + timedelta(days=1)
        )

        response = self._patch({"discount_ends_at": None})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["discount_price"], "40.00")
        self.assertIsNone(response.data["discount_ends_at"])
        self.assertTrue(response.data["discount_active"])

    def test_a_new_sale_price_over_an_ended_sale_needs_a_new_end(self) -> None:
        Product.objects.filter(pk=self.product.pk).update(
            discount_price=Decimal("40.00"), discount_ends_at=timezone.now() - timedelta(hours=1)
        )

        refused = self._patch({"discount_price": "35.00"})
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_ends_at", refused.data)

        accepted = self._patch({"discount_price": "35.00", "discount_ends_at": self._future()})
        self.assertEqual(accepted.status_code, status.HTTP_200_OK, accepted.data)
        self.assertTrue(accepted.data["discount_active"])

    def test_admin_api_shows_the_stored_ended_sale_as_inactive(self) -> None:
        ended_at = timezone.now() - timedelta(hours=1)
        Product.objects.filter(pk=self.product.pk).update(
            discount_price=Decimal("40.00"), discount_ends_at=ended_at
        )

        response = self.client.get(self.url)

        self.assertEqual(response.data["discount_price"], "40.00")
        self.assertEqual(parse_datetime(response.data["discount_ends_at"]), ended_at)
        self.assertFalse(response.data["discount_active"])
        # Saving the form again (which resends the ended sale) is allowed, and clears the
        # ended sale instead of reviving it; the clearing is written to the price history.
        renamed = self._patch({"name": "Renamed Chair", "discount_price": "40.00"})
        self.assertEqual(renamed.status_code, status.HTTP_200_OK, renamed.data)
        self.assertIsNone(renamed.data["discount_price"])
        change = ProductPriceChange.objects.get(product=self.product)
        self.assertEqual(
            (change.old_discount_price, change.new_discount_price), (Decimal("40.00"), None)
        )

    def test_price_change_is_recorded(self) -> None:
        response = self._patch({"price": "60.00"})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        change = ProductPriceChange.objects.get(product=self.product)
        self.assertEqual((change.old_price, change.new_price), (Decimal("50.00"), Decimal("60.00")))
        self.assertEqual(change.changed_by, self.admin)

    def test_an_edit_without_a_price_change_writes_no_history(self) -> None:
        response = self._patch({"name": "New Name", "price": "50.00"})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(ProductPriceChange.objects.exists())

    def test_a_refused_edit_writes_no_history(self) -> None:
        response = self._patch({"price": "60.00", "discount_price": "70.00"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ProductPriceChange.objects.exists())


class ServiceHistoryTests(TestCase):
    def test_service_default_source_is_admin_edit_without_an_actor(self) -> None:
        category = Category.objects.create(name="Furniture", slug="furniture")
        product = _product(category, "service-chair", status=Product.Status.DRAFT)

        ProductService.update_product(product, ProductUpdateData(price=Decimal("25.00")))

        change = ProductPriceChange.objects.get(product=product)
        self.assertEqual(change.source, ProductPriceChange.Source.ADMIN_EDIT)
        self.assertIsNone(change.changed_by)

    def test_create_writes_no_history(self) -> None:
        from products.services import ProductCreateData

        category = Category.objects.create(name="Furniture", slug="furniture")
        ProductService.create_product(
            ProductCreateData(category_id=category.pk, name="New Chair", price=Decimal("9.00"))
        )

        self.assertFalse(ProductPriceChange.objects.exists())


class ImportHistoryTests(CatalogImportTestBase):
    def test_reupload_that_changes_the_price_writes_an_import_row(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch([_happy_item()])
        self.assertEqual(response.data["created"], 1, response.data)
        product = Product.objects.get(sku="MDL-000142")
        ends_at = timezone.now() + timedelta(days=5)
        Product.objects.filter(pk=product.pk).update(
            price=Decimal("45.00"), discount_price=Decimal("40.00"), discount_ends_at=ends_at
        )
        self.assertFalse(ProductPriceChange.objects.exists())

        free_item = _happy_item(r2_key_prefix="free-models/MDL-000142/")
        free_item["media"] = {
            key: [k.replace("models/", "free-models/", 1) for k in value]
            if isinstance(value, list)
            else value.replace("models/", "free-models/", 1) if isinstance(value, str) else value
            for key, value in free_item["media"].items()
        }
        reupload = self._post_batch([free_item], batch_id="2026-09-04-run-02")
        self.assertEqual(reupload.data["updated"], 1, reupload.data)

        product.refresh_from_db()
        self.assertEqual(product.price, Decimal("0.00"))
        self.assertIsNone(product.discount_price)
        self.assertIsNone(product.discount_ends_at)
        change = ProductPriceChange.objects.get(product=product)
        self.assertEqual(change.source, ProductPriceChange.Source.IMPORT)
        self.assertIsNone(change.changed_by)
        self.assertEqual(change.old_price, Decimal("45.00"))
        self.assertEqual(change.new_price, Decimal("0.00"))
        self.assertEqual(change.old_discount_price, Decimal("40.00"))
        self.assertIsNone(change.new_discount_price)
        self.assertEqual(change.old_discount_ends_at, ends_at)
        self.assertIsNone(change.new_discount_ends_at)

    def test_reupload_without_a_price_change_writes_nothing(self) -> None:
        self._authenticate_as_admin()
        self._post_batch([_happy_item()])

        reupload = self._post_batch([_happy_item(glb_checksum="c" * 64)], batch_id="run-02")

        self.assertEqual(reupload.data["updated"], 1, reupload.data)
        self.assertFalse(ProductPriceChange.objects.exists())


class EndExpiredDiscountsTests(TestCase):
    def setUp(self) -> None:
        category = Category.objects.create(name="Furniture", slug="furniture")
        now = timezone.now()
        self.ended_at = now - timedelta(minutes=5)
        self.ended = _product(
            category, "ended", sku="END-1", discount_price=Decimal("10.00"),
            discount_ends_at=self.ended_at,
        )
        self.running = _product(
            category, "running", discount_price=Decimal("10.00"),
            discount_ends_at=now + timedelta(days=1),
        )
        self.open_sale = _product(category, "open", discount_price=Decimal("10.00"))

    def test_dry_run_lists_and_changes_nothing(self) -> None:
        out = StringIO()

        call_command("end_expired_discounts", "--dry-run", stdout=out)

        self.assertIn("END-1", out.getvalue())
        self.assertIn("expired_sales=1 dry_run=True", out.getvalue())
        self.assertNotIn("Running", out.getvalue())
        self.ended.refresh_from_db()
        self.assertEqual(self.ended.discount_price, Decimal("10.00"))
        self.assertFalse(ProductPriceChange.objects.exists())

    def test_clears_ended_sales_and_writes_history(self) -> None:
        out = StringIO()

        call_command("end_expired_discounts", stdout=out)

        self.assertIn("expired_sales_ended=1", out.getvalue())
        self.ended.refresh_from_db()
        self.assertIsNone(self.ended.discount_price)
        self.assertIsNone(self.ended.discount_ends_at)
        self.assertEqual(self.ended.price, Decimal("20.00"))
        change = ProductPriceChange.objects.get()
        self.assertEqual(change.product_id, self.ended.pk)
        self.assertEqual(change.source, ProductPriceChange.Source.SALE_ENDED)
        self.assertIsNone(change.changed_by)
        self.assertEqual(change.old_discount_price, Decimal("10.00"))
        self.assertEqual(change.old_discount_ends_at, self.ended_at)
        for other in (self.running, self.open_sale):
            other.refresh_from_db()
            self.assertEqual(other.discount_price, Decimal("10.00"))

        # Safe to repeat.
        call_command("end_expired_discounts", stdout=StringIO())
        self.assertEqual(ProductPriceChange.objects.count(), 1)

    def test_maintenance_loop_runs_it(self) -> None:
        names = [name for name, _, _ in run_maintenance_loop.maintenance_tasks()]
        self.assertIn("end_expired_discounts", names)

    def test_daily_report_counts_sales_ended_in_the_last_day(self) -> None:
        call_command("end_expired_discounts", stdout=StringIO())
        old = ProductPriceChange.objects.create(
            product=self.running, source=ProductPriceChange.Source.SALE_ENDED
        )
        ProductPriceChange.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=2)
        )

        report = build_daily_report()

        self.assertIn("  Sales ended: 1", report.body.splitlines())
        self.assertFalse(any("sale" in problem.lower() for problem in report.problems))
