"""Packages pipeline, Phase 3 (docs/PACKAGES_PIPELINE.md): each package has its own price and
history, the product price is a summary, the list shows every package and the Whole File check,
ended package sales are cleared, and no product form sets a price."""

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


@patch("products.services.package_object_exists", return_value=True)
class PackagePricingTests(APITestCase):
    setUp = _HELPERS["setUp"]
    _login = _HELPERS["_login"]
    _model = _HELPERS["_model"]
    _list = _HELPERS["_list"]
    _body = _HELPERS["_body"]
    _calculate = _HELPERS["_calculate"]
    _publish = _HELPERS["_publish"]
    _prices = _HELPERS["_prices"]

    def _chair(self, *, whole: str | None = "29.00", rig: str | None = None) -> Product:
        """A model waiting for its prices with Whole File and With Light Rig."""
        product = self._model("Racing Chair", kinds=("with_light_rig", "whole"))
        ProductFile.objects.filter(product=product, package_kind="whole").update(
            price=None if whole is None else Decimal(whole)
        )
        ProductFile.objects.filter(product=product, package_kind="with_light_rig").update(
            price=None if rig is None else Decimal(rig)
        )
        return product

    def test_the_list_shows_every_package_in_order_and_the_bundle_check(self, _exists) -> None:
        chair = self._chair(whole="40.00", rig="20.00")
        ProductFile.objects.create(
            product=chair,
            file_name="x_without_light_rig.zip",
            file_format="zip",
            file_size=100,
            storage_path=f"models/{chair.sku}/x_without_light_rig.zip",
            package_kind="without_light_rig",
            price=Decimal("15.00"),
        )

        listed = self._list(tab="waiting").data["results"][0]

        self.assertEqual(
            [row["kind"] for row in listed["packages"]],
            ["with_light_rig", "without_light_rig", "whole"],
        )
        self.assertEqual(
            listed["bundle_warning"],
            "Whole File (40.00) is not cheaper than the other packages together (35.00).",
        )

    def test_publishing_prices_each_package_and_the_product_price_is_the_cheapest(self, _exists) -> None:
        chair = self._chair(whole=None, rig=None)  # 10 hours x 20 = 200; rig 60%, whole 100%

        response = self._publish([chair])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["results"][0]["published"], response.data)
        self.assertEqual(self._prices(chair), {"whole": Decimal("200.00"), "with_light_rig": Decimal("120.00")})
        chair.refresh_from_db()
        self.assertEqual(chair.price, Decimal("120.00"))
        changes = {c.package_kind: c for c in ProductPriceChange.objects.filter(product=chair)}
        self.assertEqual(set(changes), {"whole", "with_light_rig"})
        self.assertIsNone(changes["with_light_rig"].old_price)

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
        self._publish([chair])
        history = self.client.get(
            reverse("products_admin:admin-product-price-history", kwargs={"product_id": chair.pk})
        )
        self.assertEqual(history.status_code, status.HTTP_200_OK, history.data)
        self.assertEqual({row["package_label"] for row in history.data["results"]}, {"Whole File", "With Light Rig"})


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
