"""Hours pricing: price = hours x rate x the package's percent, whole dollars, with the sale only
while the sale switch is on (docs/PRICING_PIPELINE.md, Hours pricing)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from products.catalog_import import CatalogImportService
from products.models import PricingSettings, Product, ProductFile
from products.packages import DEFAULT_PACKAGE_PERCENTS, PACKAGE_ORDER
from products.pricing import get_default_percents

PASSWORD = "Pricing-Strong-Pass-2026!"


@patch("products.services.package_object_exists", return_value=True)
class HoursPricingTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin = User.objects.create_user(
            email="hours-admin@example.com",
            full_name="Hours Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.customer = User.objects.create_user(
            email="hours-customer@example.com",
            full_name="Customer",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        self.category = Category.objects.create(name="Chairs", slug="chairs")
        self._count = 0
        self._login(self.admin)

    def _login(self, user: User) -> None:
        from accounts.services import AuthenticationService

        access = AuthenticationService.build_tokens(user, mfa=True)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _model(self, hours: str | None = "10", rate: str | None = "20", **extra) -> Product:
        self._count += 1
        sku = f"MDL-{self._count:06d}"
        product = Product.objects.create(
            category=self.category,
            name=f"Model {self._count}",
            slug=f"model-{self._count}",
            sku=sku,
            price=Decimal("0.00"),
            preview_model="https://cdn.example.com/preview.glb",
            status=Product.Status.AWAITING_PRICE,
            hours_spent=Decimal(hours) if hours is not None else None,
            hourly_rate=Decimal(rate) if rate is not None else None,
            **extra,
        )
        for kind in PACKAGE_ORDER:
            ProductFile.objects.create(
                product=product,
                file_name=f"{sku}_{kind}.zip",
                file_format="zip",
                file_size=100,
                storage_path=f"models/{sku}/{sku}_{kind}.zip",
                package_kind=kind,
            )
        return product

    def _body(self, products, **rule) -> dict:
        return {"product_ids": [str(p.pk) for p in products], "rule": "hours_price", **rule}

    def _preview(self, products, **rule):
        return self.client.post(
            reverse("products_admin:admin-pricing-preview"), self._body(products, **rule), format="json"
        )

    def _apply(self, products, **rule):
        preview = self._preview(products, **rule)
        self.assertEqual(preview.status_code, status.HTTP_200_OK, preview.data)
        body = self._body(products, preview_token=preview.data["preview_token"], **rule)
        return self.client.post(reverse("products_admin:admin-pricing-apply"), body, format="json")

    def _prices(self, product: Product) -> dict[str, Decimal | None]:
        return {row.package_kind: row.price for row in product.files.filter(is_preview=False)}

    # -- the formula -------------------------------------------------------------------------

    def test_every_package_is_hours_times_rate_times_its_percent(self, _exists) -> None:
        model = self._model(hours="10", rate="20")  # base 200

        response = self._apply([model])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            self._prices(model),
            {
                "with_light_rig": Decimal("120.00"),
                "without_light_rig": Decimal("100.00"),
                "glb_only": Decimal("50.00"),
                "environment": Decimal("60.00"),
                "whole": Decimal("200.00"),
            },
        )
        model.refresh_from_db()
        self.assertEqual(model.price, Decimal("50.00"))  # the summary is the cheapest package

    def test_the_preview_lists_a_row_per_package_and_counts_models_once(self, _exists) -> None:
        first, second = self._model(), self._model()

        preview = self._preview([first, second])

        self.assertEqual(len(preview.data["rows"]), 10)
        self.assertEqual(preview.data["summary"]["models"], 2)
        self.assertEqual(
            {row["package_kind"] for row in preview.data["rows"]}, set(PACKAGE_ORDER)
        )

    def test_a_model_percent_overrides_the_default(self, _exists) -> None:
        model = self._model(package_percents={"glb_only": "50"})

        self._apply([model])

        self.assertEqual(self._prices(model)["glb_only"], Decimal("100.00"))
        self.assertEqual(self._prices(model)["whole"], Decimal("200.00"))

    def test_prices_round_to_whole_dollars(self, _exists) -> None:
        model = self._model(hours="1.5", rate="7")  # base 10.5; glb_only 25% = 2.625

        self._apply([model])

        self.assertEqual(self._prices(model)["glb_only"], Decimal("3.00"))
        self.assertEqual(self._prices(model)["whole"], Decimal("11.00"))

    def test_a_package_that_rounds_below_the_minimum_refuses_the_save(self, _exists) -> None:
        model = self._model(hours="1", rate="1")  # glb_only 25% = 0.25 -> 0

        response = self._apply([model])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._prices(model)["glb_only"], None)

    def test_a_model_without_hours_or_rate_is_an_error_row(self, _exists) -> None:
        ready, no_hours, no_rate = self._model(), self._model(hours=None), self._model(rate=None)

        preview = self._preview([ready, no_hours, no_rate])

        self.assertEqual(preview.data["summary"]["errors"], 2)
        errors = {row["id"]: row["error"] for row in preview.data["rows"] if row["error"]}
        self.assertEqual(set(errors), {str(no_hours.pk), str(no_rate.pk)})
        self.assertIn("hours", errors[str(no_hours.pk)])
        response = self._apply([ready, no_hours])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data[str(no_hours.pk)], [errors[str(no_hours.pk)]])

    # -- the sale switch ---------------------------------------------------------------------

    def test_the_sale_is_off_unless_the_switch_is_on(self, _exists) -> None:
        model = self._model()
        ends = (timezone.now() + timedelta(days=3)).isoformat()

        # Off: a sale percent that is sent is ignored, and the sale end is refused.
        self._apply([model], sale_percent="20")
        self.assertFalse(model.files.filter(discount_price__isnull=False).exists())
        refused = self._preview([model], discount_ends_at=ends)
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)

        # On: every package gets the sale, rounded to whole dollars, with the end.
        response = self._apply([model], sale_enabled=True, sale_percent="20", discount_ends_at=ends)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        sales = {row.package_kind: row.discount_price for row in model.files.filter(is_preview=False)}
        self.assertEqual(sales["whole"], Decimal("160.00"))
        self.assertEqual(sales["glb_only"], Decimal("40.00"))
        self.assertTrue(all(row.discount_ends_at for row in model.files.filter(is_preview=False)))

        # Switched off again: the next hours price clears the sale.
        self._apply([model])
        self.assertFalse(model.files.filter(discount_price__isnull=False).exists())

    def test_the_sale_switch_needs_a_percentage_of_at_most_90(self, _exists) -> None:
        model = self._model()
        self.assertEqual(
            self._preview([model], sale_enabled=True).status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertEqual(
            self._preview([model], sale_enabled=True, sale_percent="91").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_a_sale_over_50_percent_needs_the_typed_count(self, _exists) -> None:
        model = self._model()
        rule = {"sale_enabled": True, "sale_percent": "60"}
        preview = self._preview([model], **rule)
        self.assertTrue(preview.data["summary"]["needs_confirmation"])
        body = self._body([model], preview_token=preview.data["preview_token"], **rule)
        response = self.client.post(reverse("products_admin:admin-pricing-apply"), body, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        body["confirm_count"] = 1
        response = self.client.post(reverse("products_admin:admin-pricing-apply"), body, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    # -- default percents --------------------------------------------------------------------

    def test_defaults_start_with_the_built_in_values(self, _exists) -> None:
        response = self.client.get(reverse("products_admin:admin-pricing-defaults"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["package_percents"],
            {kind: f"{DEFAULT_PACKAGE_PERCENTS[kind]:.2f}" for kind in PACKAGE_ORDER},
        )

    def test_changing_a_default_changes_the_next_price_and_stales_a_preview(self, _exists) -> None:
        model = self._model()
        preview = self._preview([model])
        url = reverse("products_admin:admin-pricing-defaults")

        response = self.client.put(url, {"package_percents": {"glb_only": "40"}}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(get_default_percents()["glb_only"], Decimal("40.00"))
        self.assertEqual(get_default_percents()["whole"], Decimal("100.00"))
        stale = self.client.post(
            reverse("products_admin:admin-pricing-apply"),
            self._body([model], preview_token=preview.data["preview_token"]),
            format="json",
        )
        self.assertEqual(stale.status_code, status.HTTP_409_CONFLICT)
        self._apply([model])
        self.assertEqual(self._prices(model)["glb_only"], Decimal("80.00"))

    def test_defaults_are_validated(self, _exists) -> None:
        url = reverse("products_admin:admin-pricing-defaults")
        for bad in ({"glb_only": "0"}, {"glb_only": "201"}, {"nope": "10"}, {}):
            response = self.client.put(url, {"package_percents": bad}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.assertFalse(PricingSettings.objects.exists())

    def test_customers_cannot_read_or_change_the_defaults_or_inputs(self, _exists) -> None:
        model = self._model()
        self._login(self.customer)
        defaults = reverse("products_admin:admin-pricing-defaults")
        inputs = reverse("products_admin:admin-pricing-inputs")
        self.assertEqual(self.client.get(defaults).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.put(defaults, {"package_percents": {"whole": "90"}}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                inputs, {"items": [{"id": str(model.pk), "hours_spent": "5"}]}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    # -- the per-model inputs ----------------------------------------------------------------

    def test_inputs_save_hours_rate_and_percents_and_only_the_keys_sent(self, _exists) -> None:
        model = self._model(hours="10", rate="20", package_percents={"whole": "90"})
        url = reverse("products_admin:admin-pricing-inputs")

        response = self.client.post(
            url,
            {
                "items": [
                    {
                        "id": str(model.pk),
                        "hours_spent": "12.5",
                        "package_percents": {"glb_only": "35", "whole": None},
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {"models": 1, "changed": 1})
        model.refresh_from_db()
        self.assertEqual(model.hours_spent, Decimal("12.50"))
        self.assertEqual(model.hourly_rate, Decimal("20.00"))  # not sent: unchanged
        self.assertEqual(model.package_percents, {"glb_only": "35.00"})  # whole reset to default
        again = self.client.post(
            url, {"items": [{"id": str(model.pk), "hours_spent": "12.5"}]}, format="json"
        )
        self.assertEqual(again.data["changed"], 0)

    def test_inputs_refuse_bad_values(self, _exists) -> None:
        model = self._model()
        url = reverse("products_admin:admin-pricing-inputs")
        for item in (
            {"hours_spent": "0"},
            {"hourly_rate": "-1"},
            {"package_percents": {"whole": "0"}},
            {"package_percents": {"whole": "500"}},
            {"package_percents": {"bogus": "10"}},
        ):
            response = self.client.post(
                url, {"items": [{"id": str(model.pk), **item}]}, format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, item)
        duplicate = self.client.post(
            url,
            {"items": [{"id": str(model.pk), "hours_spent": "1"}] * 2},
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_list_returns_each_models_hours_rate_and_own_percents(self, _exists) -> None:
        self._model(hours="4", rate="25", package_percents={"whole": "90"})

        row = self.client.get(reverse("products_admin:admin-pricing"), {"tab": "waiting"}).data[
            "results"
        ][0]

        self.assertEqual(
            (row["hours_spent"], row["hourly_rate"], row["package_percents"]),
            ("4.00", "25.00", {"whole": "90"}),
        )

    # -- the uploader's hours ----------------------------------------------------------------

    def test_the_sheet_hours_must_be_a_number_above_zero(self, _exists) -> None:
        read = CatalogImportService._sheet_hours
        self.assertEqual(read({"hours_spent": 12.5}), Decimal("12.50"))
        self.assertEqual(read({"hours_spent": "8"}), Decimal("8.00"))
        for bad in (None, 0, -2, "abc", True, 100000, float("nan")):
            self.assertIsNone(read({"hours_spent": bad}), bad)
        self.assertIsNone(read({}))
