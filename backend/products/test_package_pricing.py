"""Packages pipeline, Phase 3 (docs/PACKAGES_PIPELINE.md): the Pricing page prices one package
kind at a time, records each package's history, keeps the product price a summary, shows the
bundle check, ends package sales, and no product form sets a price any more."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import SimpleTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from products.models import Product, ProductFile, ProductPriceChange
from products.packages import bundle_warning
from products.test_pricing_api import PricingApiTests

_HELPERS = PricingApiTests.__dict__


def _package(product: Product, kind: str, price: str | None, **fields) -> ProductFile:
    return ProductFile.objects.create(
        product=product,
        file_name=f"{product.sku}_{kind}.zip",
        file_format="zip",
        file_size=100,
        storage_path=f"models/{product.sku}/{product.sku}_{kind}.zip",
        package_kind=kind,
        price=None if price is None else Decimal(price),
        **fields,
    )


@patch("products.services.package_object_exists", return_value=True)
class PackagePricingTests(APITestCase):
    setUp = _HELPERS["setUp"]
    _login = _HELPERS["_login"]
    _model = _HELPERS["_model"]
    _list = _HELPERS["_list"]
    _preview = _HELPERS["_preview"]
    _apply = _HELPERS["_apply"]
    _publish = _HELPERS["_publish"]
    _preview_and_apply = _HELPERS["_preview_and_apply"]

    def _chair(self, *, whole: str | None = "29.00", rig: str | None = None) -> Product:
        """A model waiting for its prices with Whole File and With Light Rig."""
        product = self._model("Racing Chair", price="0.00")
        ProductFile.objects.filter(product=product).update(price=None if whole is None else Decimal(whole))
        _package(product, "with_light_rig", rig)
        return product

    def _prices(self, product: Product) -> dict[str, Decimal | None]:
        return {
            row.package_kind: row.price
            for row in ProductFile.objects.filter(product=product, is_preview=False)
        }

    def test_a_rule_prices_the_chosen_package_and_leaves_the_others(self, _exists) -> None:
        chair = self._chair(whole="29.00")

        response = self._preview_and_apply([chair], rule="set_price", price="19.00", package_kind="with_light_rig")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self._prices(chair), {"whole": Decimal("29.00"), "with_light_rig": Decimal("19.00")})
        # The product price is the summary: the cheapest priced package.
        chair.refresh_from_db()
        self.assertEqual(chair.price, Decimal("19.00"))
        change = ProductPriceChange.objects.get(product=chair)
        self.assertEqual(change.package_kind, "with_light_rig")
        self.assertIsNone(change.old_price)
        self.assertEqual(change.new_price, Decimal("19.00"))
        self.assertEqual(change.source, ProductPriceChange.Source.PRICING_PAGE)

    def test_whole_file_is_the_package_when_none_is_named(self, _exists) -> None:
        chair = self._chair(whole=None)
        self._preview_and_apply([chair], rule="set_price", price="25.00")
        self.assertEqual(self._prices(chair)["whole"], Decimal("25.00"))

    def test_a_model_without_the_package_is_listed_and_left_alone(self, _exists) -> None:
        chair = self._chair()
        lamp = self._model("Desk Lamp", price="12.00")  # Whole File only

        preview = self._preview([chair, lamp], rule="set_price", price="15.00", package_kind="with_light_rig")

        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        rows = {row["name"]: row for row in preview.data["rows"]}
        self.assertFalse(rows["Desk Lamp"]["has_package"])
        self.assertFalse(rows["Desk Lamp"]["changed"])
        self.assertEqual(rows["Desk Lamp"]["error"], "")
        self.assertEqual(preview.data["summary"]["without_package"], 1)
        saved = self._apply([chair, lamp], preview.data["preview_token"], rule="set_price", price="15.00", package_kind="with_light_rig")
        self.assertEqual(saved.data["changed"], 1, saved.data)
        self.assertEqual(self._prices(lamp), {"whole": Decimal("12.00")})

    def test_a_sale_needs_a_price_on_that_package(self, _exists) -> None:
        chair = self._chair(rig=None)
        preview = self._preview([chair], rule="percent_off", percent="20", package_kind="with_light_rig")
        self.assertEqual(preview.data["rows"][0]["error"], "Set the price before giving a sale.")

    def test_a_sale_on_one_package_changes_only_that_package(self, _exists) -> None:
        chair = self._chair(whole="30.00", rig="20.00")
        ends = timezone.now() + timedelta(days=5)

        self._preview_and_apply(
            [chair], rule="percent_off", percent="25", package_kind="whole",
            discount_ends_at=ends.isoformat(),
        )

        whole = ProductFile.objects.get(product=chair, package_kind="whole")
        self.assertEqual(whole.discount_price, Decimal("22.50"))
        self.assertIsNone(ProductFile.objects.get(product=chair, package_kind="with_light_rig").discount_price)

    def test_the_preview_and_the_list_show_every_package_and_the_bundle_check(self, _exists) -> None:
        chair = self._chair(whole="29.00", rig="20.00")
        _package(chair, "without_light_rig", "15.00")

        preview = self._preview([chair], rule="set_price", price="40.00", package_kind="whole")
        packages = {row["kind"]: row["price"] for row in preview.data["rows"][0]["packages"]}
        self.assertEqual(packages, {"with_light_rig": "20.00", "without_light_rig": "15.00", "whole": "40.00"})
        self.assertEqual(
            preview.data["rows"][0]["bundle_warning"],
            "Whole File (40.00) is not cheaper than the other packages together (35.00).",
        )
        listed = self._list(tab="waiting").data["results"][0]
        self.assertEqual([row["kind"] for row in listed["packages"]], ["with_light_rig", "without_light_rig", "whole"])
        self.assertEqual(listed["bundle_warning"], "")

    def test_publish_needs_every_package_priced(self, _exists) -> None:
        chair = self._chair(whole="29.00", rig=None)
        refused = self._publish([chair])
        self.assertIn("With Light Rig", refused.data["results"][0]["reason"])
        self._preview_and_apply([chair], rule="set_price", price="19.00", package_kind="with_light_rig")
        self.assertTrue(self._publish([chair]).data["results"][0]["published"])

    def test_the_live_tab_lists_paid_models_on_the_store(self, _exists) -> None:
        live = self._model("Live Chair", status_value=Product.Status.PUBLISHED, price="20.00")
        free = self._model("Free Stool", status_value=Product.Status.PUBLISHED, price="0.00", free=True)
        names = {row["name"] for row in self._list(tab="live").data["results"]}
        self.assertIn(live.name, names)
        self.assertNotIn(free.name, names)

    def test_ended_package_sales_are_cleared_with_history_and_the_summary_follows(self, _exists) -> None:
        chair = self._chair(whole="30.00", rig="20.00")
        past = timezone.now() - timedelta(minutes=5)
        ProductFile.objects.filter(product=chair, package_kind="with_light_rig").update(
            discount_price=Decimal("15.00"), discount_ends_at=past
        )
        Product.objects.filter(pk=chair.pk).update(
            price=Decimal("20.00"), discount_price=Decimal("15.00"), discount_ends_at=past
        )

        out = StringIO()
        call_command("end_expired_discounts", stdout=out)

        rig = ProductFile.objects.get(product=chair, package_kind="with_light_rig")
        self.assertIsNone(rig.discount_price)
        self.assertIsNone(rig.discount_ends_at)
        chair.refresh_from_db()
        self.assertEqual((chair.price, chair.discount_price, chair.discount_ends_at), (Decimal("20.00"), None, None))
        change = ProductPriceChange.objects.get(product=chair)
        self.assertEqual((change.source, change.package_kind), (ProductPriceChange.Source.SALE_ENDED, "with_light_rig"))
        self.assertIn("expired_sales_ended=1", out.getvalue())

    def test_no_product_form_sets_a_price(self, _exists) -> None:
        chair = self._chair()
        detail = reverse("products_admin:admin-product-detail", kwargs={"product_id": chair.pk})
        for body in ({"price": "10.00"}, {"discount_price": "5.00"}, {"discount_ends_at": None}):
            with self.subTest(body=body):
                response = self.client.patch(detail, body, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("Pricing page", str(response.data))
        created = self.client.post(
            reverse("products_admin:admin-products"),
            {"category_id": str(self.chairs.pk), "name": "New Chair", "price": "9.00"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_400_BAD_REQUEST)
        created = self.client.post(
            reverse("products_admin:admin-products"),
            {"category_id": str(self.chairs.pk), "name": "New Chair"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["price"], "0.00")

    def test_the_history_api_names_the_package(self, _exists) -> None:
        chair = self._chair(whole=None)
        self._preview_and_apply([chair], rule="set_price", price="25.00")
        history = self.client.get(
            reverse("products_admin:admin-product-price-history", kwargs={"product_id": chair.pk})
        )
        self.assertEqual(history.status_code, status.HTTP_200_OK, history.data)
        self.assertEqual(history.data["results"][0]["package_label"], "Whole File")


class BundleWarningTests(SimpleTestCase):
    def test_whole_file_should_be_cheaper_than_the_others_together(self) -> None:
        self.assertEqual(
            bundle_warning({"whole": Decimal("35.00"), "with_light_rig": Decimal("20.00"), "glb_only": Decimal("15.00")}),
            "Whole File (35.00) is not cheaper than the other packages together (35.00).",
        )

    def test_whole_file_should_not_cost_less_than_one_package(self) -> None:
        self.assertEqual(
            bundle_warning({"whole": Decimal("18.00"), "with_light_rig": Decimal("19.00"), "glb_only": Decimal("15.00")}),
            "Whole File (18.00) costs less than With Light Rig alone (19.00).",
        )

    def test_a_good_bundle_and_a_model_without_two_packages_give_no_warning(self) -> None:
        self.assertEqual(
            bundle_warning({"whole": Decimal("29.00"), "with_light_rig": Decimal("19.00"), "glb_only": Decimal("15.00")}),
            "",
        )
        self.assertEqual(bundle_warning({"whole": Decimal("29.00")}), "")
        self.assertEqual(bundle_warning({"with_light_rig": Decimal("19.00"), "glb_only": Decimal("9.00")}), "")
