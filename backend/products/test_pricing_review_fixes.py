"""Fixes from the Part 1 security review (docs/PRICING_PIPELINE.md).

- A live free model uploaded again as paid leaves the store (its zip is now private).
- A paid model cannot be made free by an admin edit (no product form sets a price now:
  packages are priced on the Pricing page, docs/PACKAGES_PIPELINE.md).
- A stale form cannot send a model that passed QA back to the QA queue.
- A sale that breaks the rules never reaches the store.

The ended-sale and sale-floor cases of the old product form are now the Pricing page's rules
(test_pricing_api, test_package_pricing) and the per-package publish check.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from rest_framework import status

from products.catalog_import import FREE_TO_PAID_OFF_SALE
from products.errors import ProductError
from products.models import Product
from products.services import ProductService
from products.test_catalog_import import CatalogImportTestBase, _happy_item
from products.test_catalog_reupload import _free_item
from products.testing import moved_media, price_packages

_SKU = "MDL-000142"


def _single(item: dict) -> dict:
    """The item with its one package uploaded as GLB Only: Whole File is not priced."""
    media = moved_media(item["media"], "_whole.zip", "_glb_only.zip")
    for package in media["packages"]:
        package["kind"] = "glb_only"
    return {**item, "media": media}


class PricingReviewFixTests(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self._authenticate_as_admin()

    def _url(self, name: str, product: Product) -> str:
        return reverse(f"products_admin:admin-product-{name}", kwargs={"product_id": product.pk})

    def _upload(self, item: dict, batch_id: str) -> dict:
        response = self._post_batch([item], batch_id=batch_id)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["results"][0]

    def _approve(self, product: Product):
        return self.client.post(self._url("approve", product), {}, format="json")

    def _patch(self, product: Product, data: dict):
        return self.client.patch(self._url("detail", product), data, format="json")

    def _live_free(self) -> Product:
        self._upload(_free_item(), "2026-11-10-free-01")
        product = Product.objects.get(sku=_SKU)
        self.assertEqual(self._approve(product).status_code, status.HTTP_200_OK)
        product.refresh_from_db()
        self.assertEqual((product.status, product.price), (Product.Status.PUBLISHED, Decimal("0.00")))
        return product

    def _live_paid(self, price: str = "40.00") -> Product:
        self._upload(_happy_item(), "2026-11-10-paid-01")
        product = Product.objects.get(sku=_SKU)
        self.assertEqual(self._approve(product).status_code, status.HTTP_200_OK)
        price_packages(product, price)
        Product.objects.filter(pk=product.pk).update(status=Product.Status.PUBLISHED)
        product.refresh_from_db()
        return product

    # -- 1. live free model uploaded again as paid ---------------------------------------

    def test_live_free_model_uploaded_as_paid_leaves_the_store(self) -> None:
        product = self._live_free()

        row = self._upload(_happy_item(), "2026-11-10-paid-02")

        product.refresh_from_db()
        self.assertEqual(row["action"], "updated", row)
        self.assertIn(FREE_TO_PAID_OFF_SALE, row.get("warnings", []))
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertFalse(product.pending_update)
        self.assertEqual(ProductService.upload_kind(product), "paid")
        # No longer a public free download.
        self.client.credentials()
        response = self.client.get(
            reverse("products:product-free-download", kwargs={"slug": product.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_live_update_of_a_paid_upload_at_price_zero_goes_to_waiting_for_price(self) -> None:
        product = self._live_paid()
        # Older data: a live paid upload at price 0, flagged as an update.
        Product.objects.filter(pk=product.pk).update(price=Decimal("0.00"), pending_update=True)

        response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "awaiting_price")

    # -- 2. a paid model cannot be made free by an edit -----------------------------------

    def test_patch_price_zero_on_a_paid_upload_is_refused(self) -> None:
        product = self._live_paid()

        response = self._patch(product, {"price": "0.00"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("Pricing page", str(response.data["price"]))
        product.refresh_from_db()
        self.assertEqual(product.price, Decimal("40.00"))

    # -- 4. a stale form cannot undo a QA approval ------------------------------------------

    def test_patch_cannot_send_a_waiting_model_back_to_qa(self) -> None:
        self._upload(_happy_item(), "2026-11-10-paid-03")
        product = Product.objects.get(sku=_SKU)
        self._approve(product)

        response = self._patch(product, {"status": "pending_review", "name": "Typo fixed"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.AWAITING_PRICE)

    def test_reupload_still_sends_a_waiting_model_back_to_qa(self) -> None:
        self._upload(_happy_item(), "2026-11-10-paid-04")
        product = Product.objects.get(sku=_SKU)
        self._approve(product)

        self._upload(_happy_item(), "2026-11-10-paid-05")

        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)

    # -- 6. a sale from the upload sheet never skips the sale rules (E2E finding) -----------

    def test_the_import_ignores_a_sale_price_from_the_sheet(self) -> None:
        row = self._upload(_happy_item(discount_price="0.10"), "2026-11-10-sheet-sale")

        product = Product.objects.get(sku=_SKU)
        self.assertEqual(row["action"], "created", row)
        # The sheet's price and sale are not read: packages are priced on the Pricing page.
        self.assertIsNone(product.discount_price)
        self.assertEqual(product.price, Decimal("0.00"))
        self.assertFalse(product.files.filter(discount_price__isnull=False).exists())

    def test_the_publish_check_refuses_a_sale_that_breaks_the_rules(self) -> None:
        self._upload(_single(_happy_item()), "2026-11-10-paid-06")
        product = Product.objects.get(sku=_SKU)
        self._approve(product)
        # Older data: a 0.10 sale on a 29.99 package, stored before the rules existed.
        price_packages(product, "29.99", discount_price=Decimal("0.10"))

        with self.assertRaises(ProductError) as raised:
            ProductService._validate_publish_ready(product, require_sku=True)

        self.assertIn("GLB Only: its sale price 0.10 is not allowed", " ".join(raised.exception.errors["price"]))
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.AWAITING_PRICE)

    def test_pricing_the_model_replaces_a_stored_sale_so_it_can_be_published(self) -> None:
        self._upload(_single(_happy_item()), "2026-11-10-paid-07")
        product = Product.objects.get(sku=_SKU)
        self._approve(product)
        price_packages(product, "29.99", discount_price=Decimal("0.10"))
        Product.objects.filter(pk=product.pk).update(hours_spent=Decimal("1.5"))
        body = {
            "product_ids": [str(product.pk)],
            "rate": "20",
            "percents": {
                "with_light_rig": "60", "without_light_rig": "50", "glb_only": "100",
                "environment": "30",
            },
        }
        token = self.client.post(
            reverse("products_admin:admin-pricing-calculate"), body, format="json"
        ).data["preview_token"]

        response = self.client.post(
            reverse("products_admin:admin-pricing-publish"),
            {**body, "preview_token": token, "confirm_count": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["results"][0]["published"], response.data)
        package = product.files.get(is_preview=False, package_kind="glb_only")
        self.assertEqual((package.price, package.discount_price), (Decimal("30.00"), None))
