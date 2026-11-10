"""Pricing page API (docs/PRICING_PIPELINE.md, Part 2).

The server calculates every price; save is all-or-nothing and refused when anything changed
since the preview; publish checks each model on its own.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ActivityLog, Role, User
from categories.models import Category
from products.models import Product, ProductFile, ProductPriceChange
from products.pricing import ending_99

PASSWORD = "Pricing-Strong-Pass-2026!"


def _money(value: str) -> Decimal:
    return Decimal(value)


@patch("products.services.package_object_exists", return_value=True)
class PricingApiTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin = User.objects.create_user(
            email="pricing-admin@example.com",
            full_name="Pricing Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.customer = User.objects.create_user(
            email="pricing-customer@example.com",
            full_name="Customer",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        self.furniture = Category.objects.create(name="Furniture", slug="furniture")
        self.chairs = Category.objects.create(name="Chairs", slug="chairs", parent=self.furniture)
        self.lighting = Category.objects.create(name="Lighting", slug="lighting")
        self._sku = 0
        self._login(self.admin)

    # -- helpers -----------------------------------------------------------------------------

    def _login(self, user: User, *, mfa: bool = True) -> None:
        from accounts.services import AuthenticationService

        access = AuthenticationService.build_tokens(user, mfa=mfa)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _model(
        self,
        name: str,
        *,
        status_value: str = Product.Status.AWAITING_PRICE,
        price: str = "20.00",
        polygons: int | None = 50_000,
        category: Category | None = None,
        free: bool = False,
        batch: str = "batch-a",
        sale: str | None = None,
        sale_ends_at=None,
    ) -> Product:
        self._sku += 1
        sku = f"MDL-{self._sku:06d}"
        product = Product.objects.create(
            category=category or self.chairs,
            name=name,
            slug=f"{name.lower().replace(' ', '-')}-{self._sku}",
            sku=sku,
            import_batch_id=batch,
            price=_money(price),
            discount_price=_money(sale) if sale else None,
            discount_ends_at=sale_ends_at,
            preview_model="https://cdn.example.com/preview.glb",
            polygon_count=polygons,
            preview_triangle_count=(polygons // 4) if polygons else None,
            status=status_value,
        )
        folder = "free-models" if free else "models"
        ProductFile.objects.create(
            product=product,
            file_name="package.zip",
            file_format="zip",
            file_size=100,
            storage_path=f"{folder}/{sku}/package.zip",
        )
        return product

    def _list(self, **params):
        return self.client.get(reverse("products_admin:admin-pricing"), params)

    def _preview(self, products, **rule):
        body = {"product_ids": [str(p.pk) for p in products], **rule}
        return self.client.post(reverse("products_admin:admin-pricing-preview"), body, format="json")

    def _apply(self, products, token: str, confirm_count=None, **rule):
        body = {"product_ids": [str(p.pk) for p in products], "preview_token": token, **rule}
        if confirm_count is not None:
            body["confirm_count"] = confirm_count
        return self.client.post(reverse("products_admin:admin-pricing-apply"), body, format="json")

    def _publish(self, products, confirm_count=None):
        ids = [str(p.pk) for p in products]
        body = {"product_ids": ids, "confirm_count": len(ids) if confirm_count is None else confirm_count}
        return self.client.post(reverse("products_admin:admin-pricing-publish"), body, format="json")

    def _preview_and_apply(self, products, confirm_count=None, **rule):
        preview = self._preview(products, **rule)
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        return self._apply(products, preview.data["preview_token"], confirm_count, **rule)

    # -- access -----------------------------------------------------------------------------

    def test_customers_and_anonymous_visitors_are_refused(self, _exists) -> None:
        model = self._model("Chair")
        self._login(self.customer)
        self.assertEqual(self._list(tab="waiting").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self._preview([model], rule="set_price", price="9.00").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.credentials()
        self.assertEqual(self._list(tab="waiting").status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self._publish([model]).status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(ADMIN_MFA_REQUIRED=True)
    def test_an_admin_without_the_authenticator_mark_is_refused(self, _exists) -> None:
        self._login(self.admin, mfa=False)
        refused = (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        self.assertIn(self._list(tab="waiting").status_code, refused)
        model = self._model("Chair")
        self.assertIn(self._publish([model]).status_code, refused)
        model.refresh_from_db()
        self.assertEqual(model.status, Product.Status.AWAITING_PRICE)

    # -- list and filters --------------------------------------------------------------------

    def test_tabs_list_waiting_and_live_paid_models_only(self, _exists) -> None:
        waiting = self._model("Waiting Chair")
        live = self._model("Live Chair", status_value=Product.Status.PUBLISHED)
        self._model("Free Chair", status_value=Product.Status.PUBLISHED, price="0.00", free=True)
        self._model("Free Waiting", free=True)
        self._model("In QA", status_value=Product.Status.PENDING_REVIEW)

        waiting_ids = {row["id"] for row in self._list(tab="waiting").data["results"]}
        live_ids = {row["id"] for row in self._list(tab="live").data["results"]}

        self.assertEqual(waiting_ids, {str(waiting.pk)})
        self.assertEqual(live_ids, {str(live.pk)})
        self.assertEqual(self._list(tab="other").status_code, status.HTTP_400_BAD_REQUEST)

    def test_filters_category_subcategory_poly_search_and_batch(self, _exists) -> None:
        low = self._model("Low Stool", polygons=9_999, batch="batch-1")
        mid = self._model("Mid Chair", polygons=10_000)
        high = self._model("High Sofa", polygons=100_001, category=self.furniture)
        unknown = self._model("Lamp", polygons=None, category=self.lighting, batch="batch-1")

        def ids(**params):
            response = self._list(tab="waiting", **params)
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            return {row["id"] for row in response.data["results"]}

        # A main category includes its subcategories.
        self.assertEqual(ids(category_id=self.furniture.pk), {str(low.pk), str(mid.pk), str(high.pk)})
        self.assertEqual(ids(subcategory_id=self.chairs.pk), {str(low.pk), str(mid.pk)})
        self.assertEqual(ids(poly="low"), {str(low.pk)})
        self.assertEqual(ids(poly="mid"), {str(mid.pk)})
        self.assertEqual(ids(poly="high"), {str(high.pk)})
        self.assertEqual(ids(poly="unknown"), {str(unknown.pk)})
        # The admin can move the limits.
        self.assertEqual(ids(poly="low", low_below=10_001), {str(low.pk), str(mid.pk)})
        self.assertEqual(ids(search="sofa"), {str(high.pk)})
        self.assertEqual(ids(search=high.sku.lower()), {str(high.pk)})
        self.assertEqual(ids(import_batch_id="batch-1"), {str(low.pk), str(unknown.pk)})
        rows = {row["id"]: row for row in self._list(tab="waiting").data["results"]}
        self.assertEqual(rows[str(mid.pk)]["poly_tier"], "mid")
        self.assertEqual(rows[str(unknown.pk)]["poly_tier"], "unknown")
        self.assertEqual(
            self._list(tab="waiting", low_below=500, high_above=100).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_batches_lists_the_tab_upload_batches(self, _exists) -> None:
        self._model("A", batch="batch-old")
        self._model("B", batch="batch-new")
        self._model("Live", status_value=Product.Status.PUBLISHED, batch="batch-live")

        response = self.client.get(reverse("products_admin:admin-pricing-batches"), {"tab": "waiting"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], ["batch-new", "batch-old"])

    # -- preview: the calculator -------------------------------------------------------------

    def test_set_price_and_price_per_poly_level(self, _exists) -> None:
        low = self._model("Low", polygons=5_000)
        high = self._model("High", polygons=500_000)
        unknown = self._model("Unknown", polygons=None)

        one = self._preview([low, high], rule="set_price", price="12.00")
        self.assertEqual([r["new_price"] for r in one.data["rows"]], ["12.00", "12.00"])

        tiers = self._preview(
            [low, high, unknown], rule="tier_price", tier_prices={"low": "5.00", "high": "25.00"}
        )
        rows = {r["id"]: r for r in tiers.data["rows"]}
        self.assertEqual(rows[str(low.pk)]["new_price"], "5.00")
        self.assertEqual(rows[str(high.pk)]["new_price"], "25.00")
        self.assertIn("No price was given for unknown", rows[str(unknown.pk)]["error"])
        self.assertEqual(tiers.data["summary"]["errors"], 1)

    def test_percent_and_amount_off_with_the_99_ending(self, _exists) -> None:
        model = self._model("Chair", price="10.50")

        percent = self._preview([model], rule="percent_off", percent="20")
        self.assertEqual(percent.data["rows"][0]["new_sale_price"], "8.40")
        self.assertEqual(percent.data["rows"][0]["amount_off"], "2.10")
        self.assertEqual(percent.data["rows"][0]["percent_off"], "20.0")

        rounded = self._preview([model], rule="percent_off", percent="20", round_99=True)
        self.assertEqual(rounded.data["rows"][0]["new_sale_price"], "7.99")

        amount = self._preview([model], rule="amount_off", amount="3")
        self.assertEqual(amount.data["rows"][0]["new_sale_price"], "7.50")
        self.assertEqual(amount.data["rows"][0]["buyer_pays"], "7.50")

    def test_ending_99(self, _exists) -> None:
        self.assertEqual(ending_99(Decimal("8.40")), Decimal("7.99"))
        self.assertEqual(ending_99(Decimal("9.00")), Decimal("8.99"))
        self.assertEqual(ending_99(Decimal("8.99")), Decimal("8.99"))

    def test_row_errors(self, _exists) -> None:
        cheap = self._model("Cheap", price="1.00")
        on_sale = self._model(
            "On Sale",
            status_value=Product.Status.PUBLISHED,
            price="20.00",
            sale="15.00",
            sale_ends_at=timezone.now() + timedelta(days=3),
        )
        free = self._model("Free", status_value=Product.Status.PUBLISHED, price="0.00", free=True)
        in_qa = self._model("In QA", status_value=Product.Status.PENDING_REVIEW)

        below_minimum = self._preview([cheap], rule="set_price", price="0.40").data["rows"][0]
        self.assertIn("at least 0.50", below_minimum["error"])
        too_deep = self._preview([cheap], rule="amount_off", amount="0.60").data["rows"][0]
        self.assertIn("lowest allowed is 0.50", too_deep["error"])
        over_90 = self._preview([on_sale], rule="amount_off", amount="18.50").data["rows"][0]
        self.assertIn("at most 90%", over_90["error"])
        under_sale = self._preview([on_sale], rule="set_price", price="14.00").data["rows"][0]
        self.assertIn("Remove the sale first", under_sale["error"])
        self.assertIn("Free models", self._preview([free], rule="remove_sale").data["rows"][0]["error"])
        self.assertIn("Only models waiting", self._preview([in_qa], rule="remove_sale").data["rows"][0]["error"])

    def test_request_limits(self, _exists) -> None:
        model = self._model("Chair")
        too_many = self.client.post(
            reverse("products_admin:admin-pricing-preview"),
            {"product_ids": [str(model.pk)] * 201, "rule": "remove_sale"},
            format="json",
        )
        self.assertEqual(too_many.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            self._preview([model], rule="percent_off", percent="91").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        past = (timezone.now() - timedelta(hours=1)).isoformat()
        self.assertEqual(
            self._preview([model], rule="percent_off", percent="10", discount_ends_at=past).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self._preview([model], rule="set_price").status_code, status.HTTP_400_BAD_REQUEST
        )
        missing = self.client.post(
            reverse("products_admin:admin-pricing-preview"),
            {"product_ids": ["00000000-0000-0000-0000-000000000000"], "rule": "remove_sale"},
            format="json",
        )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_ended_stored_sale_counts_as_no_sale(self, _exists) -> None:
        model = self._model(
            "Chair",
            status_value=Product.Status.PUBLISHED,
            sale="15.00",
            sale_ends_at=timezone.now() - timedelta(hours=1),
        )

        row = self._preview([model], rule="set_price", price="14.00").data["rows"][0]

        self.assertEqual(row["error"], "")
        self.assertIsNone(row["old_sale_price"])
        self.assertIsNone(row["new_sale_price"])

    # -- apply (Step 1) ----------------------------------------------------------------------

    def test_apply_saves_prices_with_one_history_batch_and_an_audit_entry(self, _exists) -> None:
        first = self._model("First", polygons=5_000)
        second = self._model("Second", polygons=200_000)

        response = self._preview_and_apply(
            [first, second], rule="tier_price", tier_prices={"low": "5.00", "high": "30.00"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["changed"], 2)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual((first.price, second.price), (Decimal("5.00"), Decimal("30.00")))
        self.assertEqual(first.status, Product.Status.AWAITING_PRICE)
        changes = ProductPriceChange.objects.filter(batch_id=response.data["batch_id"])
        self.assertEqual(changes.count(), 2)
        self.assertTrue(all(c.source == "pricing_page" and c.changed_by == self.admin for c in changes))
        self.assertTrue(
            ActivityLog.objects.filter(action="pricing_apply", target_id=response.data["batch_id"]).exists()
        )

    def test_a_sale_with_an_end_date_is_saved(self, _exists) -> None:
        model = self._model("Chair", status_value=Product.Status.PUBLISHED, price="40.00")
        ends = (timezone.now() + timedelta(days=7)).replace(microsecond=0)

        response = self._preview_and_apply(
            [model], rule="percent_off", percent="25", discount_ends_at=ends.isoformat()
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        model.refresh_from_db()
        self.assertEqual(model.discount_price, Decimal("30.00"))
        self.assertEqual(model.discount_ends_at, ends)
        self.assertEqual(model.effective_price(), Decimal("30.00"))

    def test_apply_is_refused_when_prices_changed_since_the_preview(self, _exists) -> None:
        model = self._model("Chair", price="20.00")
        preview = self._preview([model], rule="percent_off", percent="10")
        Product.objects.filter(pk=model.pk).update(price=Decimal("25.00"))

        response = self._apply([model], preview.data["preview_token"], rule="percent_off", percent="10")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        model.refresh_from_db()
        self.assertIsNone(model.discount_price)

    def test_a_token_from_another_rule_is_refused(self, _exists) -> None:
        model = self._model("Chair", price="20.00")
        preview = self._preview([model], rule="percent_off", percent="10")

        response = self._apply([model], preview.data["preview_token"], rule="percent_off", percent="60", confirm_count=1)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)

    def test_apply_saves_nothing_when_any_row_has_an_error(self, _exists) -> None:
        good = self._model("Good", price="20.00")
        bad = self._model("Bad", price="1.00")

        response = self._preview_and_apply([good, bad], rule="amount_off", amount="0.80")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        good.refresh_from_db()
        self.assertIsNone(good.discount_price)
        self.assertFalse(ProductPriceChange.objects.exists())

    def test_more_than_half_off_needs_the_typed_count(self, _exists) -> None:
        first = self._model("First", status_value=Product.Status.PUBLISHED, price="20.00")
        second = self._model("Second", status_value=Product.Status.PUBLISHED, price="20.00")
        rule = {"rule": "percent_off", "percent": "60"}
        preview = self._preview([first, second], **rule)
        self.assertTrue(preview.data["summary"]["needs_confirmation"])
        token = preview.data["preview_token"]

        self.assertEqual(self._apply([first, second], token, **rule).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            self._apply([first, second], token, confirm_count=1, **rule).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        ok = self._apply([first, second], token, confirm_count=2, **rule)
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.data)
        first.refresh_from_db()
        self.assertEqual(first.discount_price, Decimal("8.00"))

    def test_remove_sale_and_unchanged_rows(self, _exists) -> None:
        on_sale = self._model(
            "On Sale", status_value=Product.Status.PUBLISHED, sale="15.00",
            sale_ends_at=timezone.now() + timedelta(days=1),
        )
        no_sale = self._model("No Sale", status_value=Product.Status.PUBLISHED)

        response = self._preview_and_apply([on_sale, no_sale], rule="remove_sale")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data["changed"], response.data["unchanged"]), (1, 1))
        on_sale.refresh_from_db()
        self.assertIsNone(on_sale.discount_price)
        self.assertIsNone(on_sale.discount_ends_at)
        self.assertEqual(ProductPriceChange.objects.filter(product=no_sale).count(), 0)

    # -- publish (Step 2) --------------------------------------------------------------------

    def test_publish_puts_priced_models_on_the_store_and_reports_the_rest(self, _exists) -> None:
        priced = self._model("Priced", price="20.00")
        unpriced = self._model("Unpriced", price="0.00")
        live = self._model("Live", status_value=Product.Status.PUBLISHED)

        response = self._publish([priced, unpriced, live])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        results = {row["id"]: row for row in response.data["results"]}
        self.assertTrue(results[str(priced.pk)]["published"])
        self.assertIn("Set a price", results[str(unpriced.pk)]["reason"])
        self.assertIn("not waiting", results[str(live.pk)]["reason"])
        self.assertEqual((response.data["published"], response.data["failed"]), (1, 2))
        priced.refresh_from_db()
        unpriced.refresh_from_db()
        self.assertEqual(priced.status, Product.Status.PUBLISHED)
        self.assertEqual(unpriced.status, Product.Status.AWAITING_PRICE)
        self.assertTrue(ActivityLog.objects.filter(action="pricing_publish").exists())

    def test_publish_needs_the_summary_confirmation(self, _exists) -> None:
        model = self._model("Priced")
        self.assertEqual(self._publish([model], confirm_count=2).status_code, status.HTTP_400_BAD_REQUEST)
        model.refresh_from_db()
        self.assertEqual(model.status, Product.Status.AWAITING_PRICE)

    def test_publish_runs_the_publish_checks(self, _exists) -> None:
        model = self._model("No Preview")
        Product.objects.filter(pk=model.pk).update(preview_model="")

        row = self._publish([model]).data["results"][0]

        self.assertFalse(row["published"])
        self.assertIn("preview_model", row["reason"])

    def test_a_published_model_appears_in_the_shop(self, _exists) -> None:
        model = self._model("Shop Chair", price="20.00")
        self._publish([model])
        self.client.credentials()

        response = self.client.get(reverse("products:product-detail", kwargs={"slug": model.slug}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["price"], "20.00")
