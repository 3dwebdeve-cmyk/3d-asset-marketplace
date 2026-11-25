"""Pricing page API (docs/PRICING_PIPELINE.md).

The server calculates every price (hours x rate x the package's percent, whole dollars); a model
only gets a price for the packages it has; publish saves the calculated prices and puts each model
on the store on its own.
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
from products.packages import PACKAGE_ORDER, SINGLE_KINDS

PASSWORD = "Pricing-Strong-Pass-2026!"

# One rate and one percent per package, as the admin types them.
RATE = "20"
PERCENTS = {
    "with_light_rig": "60",
    "without_light_rig": "50",
    "glb_only": "25",
    "environment": "30",
}


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
        hours: str | None = "10",
        kinds: tuple[str, ...] = ("glb_only",),
        polygons: int | None = 50_000,
        category: Category | None = None,
        free: bool = False,
        batch: str = "batch-a",
        price: str | None = None,
    ) -> Product:
        """A model with one package row per kind in ``kinds`` (unpriced unless ``price``)."""
        self._sku += 1
        sku = f"MDL-{self._sku:06d}"
        product = Product.objects.create(
            category=category or self.chairs,
            name=name,
            slug=f"{name.lower().replace(' ', '-')}-{self._sku}",
            sku=sku,
            import_batch_id=batch,
            price=Decimal(price or "0.00"),
            preview_model="https://cdn.example.com/preview.glb",
            polygon_count=polygons,
            preview_triangle_count=(polygons // 4) if polygons else None,
            hours_spent=Decimal(hours) if hours is not None else None,
            status=status_value,
        )
        folder = "free-models" if free else "models"
        for kind in kinds:
            ProductFile.objects.create(
                product=product,
                file_name=f"{sku}_{kind}.zip",
                file_format="zip",
                file_size=100,
                storage_path=f"{folder}/{sku}/{sku}_{kind}.zip",
                package_kind=kind,
                price=Decimal(price) if price else None,
            )
        return product

    def _list(self, **params):
        return self.client.get(reverse("products_admin:admin-pricing"), params)

    def _body(self, products, **extra) -> dict:
        return {
            "product_ids": [str(p.pk) for p in products],
            "rate": RATE,
            "percents": PERCENTS,
            **extra,
        }

    def _calculate(self, products, **extra):
        return self.client.post(
            reverse("products_admin:admin-pricing-calculate"), self._body(products, **extra), format="json"
        )

    def _publish(self, products, *, confirm_count=None, token=None, **extra):
        if token is None:
            token = self._calculate(products, **extra).data["preview_token"]
        body = self._body(
            products,
            preview_token=token,
            confirm_count=len(products) if confirm_count is None else confirm_count,
            **extra,
        )
        return self.client.post(reverse("products_admin:admin-pricing-publish"), body, format="json")

    def _prices(self, product: Product) -> dict[str, Decimal | None]:
        return {row.package_kind: row.price for row in product.files.filter(is_preview=False)}

    # -- access -----------------------------------------------------------------------------

    def test_customers_and_anonymous_visitors_are_refused(self, _exists) -> None:
        model = self._model("Chair")
        self._login(self.customer)
        self.assertEqual(self._list(tab="waiting").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._calculate([model]).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(
                reverse("products_admin:admin-pricing-hours"),
                {"items": [{"id": str(model.pk), "hours_spent": "5"}]},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.credentials()
        self.assertEqual(self._list(tab="waiting").status_code, status.HTTP_401_UNAUTHORIZED)
        publish = self.client.post(
            reverse("products_admin:admin-pricing-publish"), self._body([model]), format="json"
        )
        self.assertEqual(publish.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(ADMIN_MFA_REQUIRED=True)
    def test_an_admin_without_the_authenticator_mark_is_refused(self, _exists) -> None:
        self._login(self.admin, mfa=False)
        refused = (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        self.assertIn(self._list(tab="waiting").status_code, refused)
        model = self._model("Chair")
        self.assertIn(self._calculate([model]).status_code, refused)
        self.assertIn(
            self.client.post(
                reverse("products_admin:admin-pricing-publish"), self._body([model]), format="json"
            ).status_code,
            refused,
        )
        model.refresh_from_db()
        self.assertEqual(model.status, Product.Status.AWAITING_PRICE)

    # -- list and filters --------------------------------------------------------------------

    def test_tabs_list_waiting_and_live_paid_models_only(self, _exists) -> None:
        waiting = self._model("Waiting Chair")
        live = self._model("Live Chair", status_value=Product.Status.PUBLISHED, price="20.00")
        self._model("Free Chair", status_value=Product.Status.PUBLISHED, free=True, price="0")
        self._model("Free Waiting", free=True)
        self._model("In QA", status_value=Product.Status.PENDING_REVIEW)

        waiting_ids = {row["id"] for row in self._list(tab="waiting").data["results"]}
        live_ids = {row["id"] for row in self._list(tab="live").data["results"]}

        self.assertEqual(waiting_ids, {str(waiting.pk)})
        self.assertEqual(live_ids, {str(live.pk)})
        self.assertEqual(self._list(tab="other").status_code, status.HTTP_400_BAD_REQUEST)

    def test_filters_category_subcategory_search_and_batch(self, _exists) -> None:
        stool = self._model("Low Stool", batch="batch-1")
        chair = self._model("Mid Chair")
        sofa = self._model("High Sofa", category=self.furniture)
        lamp = self._model("Lamp", category=self.lighting, batch="batch-1")

        def ids(**params):
            response = self._list(tab="waiting", **params)
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            return {row["id"] for row in response.data["results"]}

        # A main category includes its subcategories.
        self.assertEqual(ids(category_id=self.furniture.pk), {str(stool.pk), str(chair.pk), str(sofa.pk)})
        self.assertEqual(ids(subcategory_id=self.chairs.pk), {str(stool.pk), str(chair.pk)})
        self.assertEqual(ids(search="sofa"), {str(sofa.pk)})
        self.assertEqual(ids(search=sofa.sku.lower()), {str(sofa.pk)})
        self.assertEqual(ids(import_batch_id="batch-1"), {str(stool.pk), str(lamp.pk)})

    def test_the_list_shows_hours_polygons_and_each_package(self, _exists) -> None:
        self._model("Oak Chair", hours="12.5", kinds=("glb_only", "with_light_rig"), polygons=12_480)

        row = self._list(tab="waiting").data["results"][0]

        self.assertEqual((row["hours_spent"], row["polygon_count"]), ("12.50", 12_480))
        self.assertEqual([item["kind"] for item in row["packages"]], ["with_light_rig", "glb_only"])
        self.assertEqual({item["price"] for item in row["packages"]}, {None})

    def test_batches_lists_the_tab_upload_batches(self, _exists) -> None:
        self._model("A", batch="batch-old")
        self._model("B", batch="batch-new")
        self._model("Live", status_value=Product.Status.PUBLISHED, batch="batch-live", price="20.00")

        response = self.client.get(reverse("products_admin:admin-pricing-batches"), {"tab": "waiting"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], ["batch-new", "batch-old"])

    # -- calculate ---------------------------------------------------------------------------

    def test_a_model_with_every_package_gets_four_prices_and_whole_file_none(self, _exists) -> None:
        # Whole File is the zip All variations delivers: nobody prices it.
        model = self._model("Chair", hours="10", kinds=PACKAGE_ORDER)  # base 10 x 20 = 200

        response = self._calculate([model])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = response.data["rows"][0]
        self.assertEqual(
            {item["kind"]: item["price"] for item in row["packages"]},
            {
                "with_light_rig": "120.00",
                "without_light_rig": "100.00",
                "glb_only": "50.00",
                "environment": "60.00",
            },
        )
        self.assertEqual([item["kind"] for item in row["packages"]], list(SINGLE_KINDS))
        self.assertIsNone(ProductFile.objects.get(product=model, package_kind="whole").price)
        self.assertEqual(response.data["summary"], {"models": 1, "priced": 1, "errors": 0, "currency": "USD"})

    def test_a_model_is_priced_only_for_the_packages_it_has(self, _exists) -> None:
        full = self._model("Full", hours="10", kinds=PACKAGE_ORDER)
        partial = self._model("Partial", hours="5", kinds=("glb_only", "with_light_rig"))

        rows = {row["id"]: row for row in self._calculate([full, partial]).data["rows"]}

        self.assertEqual(len(rows[str(full.pk)]["packages"]), 4)
        self.assertEqual(
            {item["kind"]: item["price"] for item in rows[str(partial.pk)]["packages"]},
            {"glb_only": "25.00", "with_light_rig": "60.00"},  # base 5 x 20 = 100
        )

    def test_calculating_changes_nothing(self, _exists) -> None:
        model = self._model("Chair")

        self._calculate([model])

        self.assertEqual(self._prices(model), {"glb_only": None})
        self.assertFalse(ProductPriceChange.objects.exists())

    def test_prices_round_to_whole_dollars(self, _exists) -> None:
        model = self._model("Chair", hours="1.5", kinds=("glb_only", "with_light_rig"))
        body = self._body([model], rate="7")  # base 10.5; GLB 25% = 2.625; rig 60% = 6.3

        response = self.client.post(reverse("products_admin:admin-pricing-calculate"), body, format="json")

        prices = {item["kind"]: item["price"] for item in response.data["rows"][0]["packages"]}
        self.assertEqual(prices, {"glb_only": "3.00", "with_light_rig": "6.00"})

    def test_a_model_without_hours_has_an_error_and_the_others_are_priced(self, _exists) -> None:
        ready = self._model("Ready")
        no_hours = self._model("No Hours", hours=None)

        response = self._calculate([ready, no_hours])

        rows = {row["id"]: row for row in response.data["rows"]}
        self.assertEqual(rows[str(ready.pk)]["error"], "")
        self.assertIn("hours", rows[str(no_hours.pk)]["error"])
        self.assertEqual(rows[str(no_hours.pk)]["packages"], [])
        self.assertEqual(response.data["summary"]["errors"], 1)

    def test_a_package_that_rounds_below_the_minimum_is_an_error(self, _exists) -> None:
        model = self._model("Cheap", hours="1", kinds=("glb_only", "with_light_rig"))

        response = self.client.post(
            reverse("products_admin:admin-pricing-calculate"),
            self._body([model], rate="1"),  # base 1; GLB 25% = 0.25 -> 0
            format="json",
        )

        row = response.data["rows"][0]
        self.assertIn("GLB Only", row["error"])
        self.assertEqual(row["packages"], [])

    def test_only_waiting_paid_models_are_priced(self, _exists) -> None:
        live = self._model("Live", status_value=Product.Status.PUBLISHED, price="20.00")
        free = self._model("Free", free=True)

        rows = {row["id"]: row for row in self._calculate([live, free]).data["rows"]}

        self.assertIn("waiting for a price", rows[str(live.pk)]["error"])
        self.assertIn("Free", rows[str(free.pk)]["error"])

    def test_the_rate_and_percents_are_validated(self, _exists) -> None:
        model = self._model("Chair")
        url = reverse("products_admin:admin-pricing-calculate")
        bad_bodies = [
            self._body([model], rate="0"),
            self._body([model], rate="100001"),
            self._body([model], percents={**PERCENTS, "environment": "0"}),
            self._body([model], percents={**PERCENTS, "environment": "201"}),
            self._body([model], percents={key: value for key, value in PERCENTS.items() if key != "environment"}),
            # Whole File has no percent: All variations sells it.
            self._body([model], percents={**PERCENTS, "whole": "100"}),
            self._body([model], percents={**PERCENTS, "bogus": "10"}),
            {**self._body([model]), "product_ids": []},
            {**self._body([model]), "product_ids": ["not-an-id"]},
        ]
        for body in bad_bodies:
            self.assertEqual(
                self.client.post(url, body, format="json").status_code, status.HTTP_400_BAD_REQUEST, body
            )

    def test_at_most_200_models_per_action(self, _exists) -> None:
        models = [self._model(f"M{index}") for index in range(3)]
        with patch("products.pricing.MAX_MODELS_PER_ACTION", 2), patch(
            "products.pricing_serializers.MAX_MODELS_PER_ACTION", 2
        ):
            response = self._calculate(models)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -- hours -------------------------------------------------------------------------------

    def test_hours_can_be_set_and_cleared(self, _exists) -> None:
        model = self._model("Chair", hours=None)
        url = reverse("products_admin:admin-pricing-hours")

        response = self.client.post(
            url, {"items": [{"id": str(model.pk), "hours_spent": "7.5"}]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {"models": 1, "changed": 1})
        model.refresh_from_db()
        self.assertEqual(model.hours_spent, Decimal("7.50"))

        again = self.client.post(
            url, {"items": [{"id": str(model.pk), "hours_spent": "7.5"}]}, format="json"
        )
        self.assertEqual(again.data["changed"], 0)
        cleared = self.client.post(
            url, {"items": [{"id": str(model.pk), "hours_spent": None}]}, format="json"
        )
        self.assertEqual(cleared.data["changed"], 1)
        model.refresh_from_db()
        self.assertIsNone(model.hours_spent)

    def test_bad_hours_are_refused(self, _exists) -> None:
        model = self._model("Chair")
        url = reverse("products_admin:admin-pricing-hours")
        for item in ({"hours_spent": "0"}, {"hours_spent": "-3"}, {"hours_spent": "abc"}):
            response = self.client.post(url, {"items": [{"id": str(model.pk), **item}]}, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, item)
        duplicate = self.client.post(
            url, {"items": [{"id": str(model.pk), "hours_spent": "1"}] * 2}, format="json"
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    # -- publish -----------------------------------------------------------------------------

    def test_publish_saves_the_prices_with_history_and_puts_the_model_on_the_store(self, _exists) -> None:
        full = self._model("Full", hours="10", kinds=PACKAGE_ORDER)
        partial = self._model("Partial", hours="5", kinds=("glb_only", "with_light_rig"))

        response = self._publish([full, partial])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data["published"], response.data["failed"]), (2, 0))
        full.refresh_from_db()
        partial.refresh_from_db()
        self.assertEqual(full.status, Product.Status.PUBLISHED)
        self.assertEqual(self._prices(full)["with_light_rig"], Decimal("120.00"))
        self.assertEqual(self._prices(partial), {"glb_only": Decimal("25.00"), "with_light_rig": Decimal("60.00")})
        self.assertIsNone(self._prices(full)["whole"])
        # The model's own price is its cheapest package.
        self.assertEqual((full.price, partial.price), (Decimal("50.00"), Decimal("25.00")))
        changes = ProductPriceChange.objects.filter(batch_id=response.data["batch_id"])
        self.assertEqual(changes.count(), 6)
        self.assertTrue(all(c.source == "pricing_page" and c.changed_by == self.admin for c in changes))
        self.assertTrue(
            ActivityLog.objects.filter(
                action="pricing_publish", target_id=response.data["batch_id"]
            ).exists()
        )

    def test_a_model_that_cannot_be_priced_stays_waiting_and_the_others_go_live(self, _exists) -> None:
        ready = self._model("Ready")
        no_hours = self._model("No Hours", hours=None)

        response = self._publish([ready, no_hours])

        results = {row["id"]: row for row in response.data["results"]}
        self.assertTrue(results[str(ready.pk)]["published"])
        self.assertFalse(results[str(no_hours.pk)]["published"])
        self.assertIn("hours", results[str(no_hours.pk)]["reason"])
        no_hours.refresh_from_db()
        self.assertEqual(no_hours.status, Product.Status.AWAITING_PRICE)
        self.assertEqual(self._prices(no_hours), {"glb_only": None})

    def test_publish_is_refused_when_the_calculation_is_stale(self, _exists) -> None:
        model = self._model("Chair", hours="10")
        token = self._calculate([model]).data["preview_token"]
        Product.objects.filter(pk=model.pk).update(hours_spent=Decimal("11"))

        response = self._publish([model], token=token)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        model.refresh_from_db()
        self.assertEqual(model.status, Product.Status.AWAITING_PRICE)
        self.assertEqual(self._prices(model), {"glb_only": None})

    def test_a_token_for_other_percents_is_refused(self, _exists) -> None:
        model = self._model("Chair")
        token = self._calculate([model]).data["preview_token"]

        response = self._publish(
            [model], token=token, percents={**PERCENTS, "environment": "90"}
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_publish_needs_the_summary_confirmation(self, _exists) -> None:
        model = self._model("Chair")

        response = self._publish([model], confirm_count=2)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        model.refresh_from_db()
        self.assertEqual(model.status, Product.Status.AWAITING_PRICE)

    def test_publish_replaces_a_stored_sale_with_the_new_price(self, _exists) -> None:
        model = self._model("Chair", hours="10")
        ProductFile.objects.filter(product=model).update(
            price=Decimal("500.00"),
            discount_price=Decimal("400.00"),
            discount_ends_at=timezone.now() + timedelta(days=3),
        )

        self._publish([model])

        package = model.files.get(is_preview=False)
        self.assertEqual(
            (package.price, package.discount_price, package.discount_ends_at),
            (Decimal("50.00"), None, None),  # 10 hours x 20 = 200; GLB Only 25%
        )

    def test_a_publish_check_that_fails_undoes_the_prices(self, _exists) -> None:
        model = self._model("Chair")

        with patch("products.pricing._publish_error", return_value="files: Package file missing."):
            response = self._publish([model])

        row = response.data["results"][0]
        self.assertFalse(row["published"])
        self.assertIn("Package file missing", row["reason"])
        model.refresh_from_db()
        self.assertEqual(model.status, Product.Status.AWAITING_PRICE)
        self.assertEqual(self._prices(model), {"glb_only": None})
        self.assertFalse(ProductPriceChange.objects.exists())

    def test_a_model_with_no_preview_and_no_360_can_be_published(self, _exists) -> None:
        model = self._model("No Preview")
        Product.objects.filter(pk=model.pk).update(preview_model="", spin_images=[])

        row = self._publish([model]).data["results"][0]

        self.assertTrue(row["published"], row)

    def test_a_published_model_appears_in_the_shop_at_its_price(self, _exists) -> None:
        model = self._model("Shop Chair", hours="1")  # base 20; GLB 25% = 5
        self._publish([model])
        self.client.credentials()

        response = self.client.get(reverse("products:product-detail", kwargs={"slug": model.slug}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["price"], "5.00")
