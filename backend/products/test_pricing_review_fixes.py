"""Fixes from the Part 1 security review (docs/PRICING_PIPELINE.md).

- A live free model uploaded again as paid leaves the store (its zip is now private).
- A paid model cannot be made free by an admin edit.
- An ended sale is never revived by resending it or by removing or moving its end.
- A stale form cannot send a model that passed QA back to the QA queue.
- A sale price is never 0 and never below the checkout minimum.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from products.catalog_import import FREE_TO_PAID_OFF_SALE
from products.models import Product, ProductPriceChange
from products.services import ProductService
from products.test_catalog_import import CatalogImportTestBase, _happy_item
from products.test_catalog_reupload import _free_item

_SKU = "MDL-000142"


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
        Product.objects.filter(pk=product.pk).update(
            status=Product.Status.PUBLISHED, price=Decimal(price)
        )
        product.refresh_from_db()
        return product

    def _with_sale(self, product: Product, sale: str, ends_at) -> Product:
        Product.objects.filter(pk=product.pk).update(
            discount_price=Decimal(sale), discount_ends_at=ends_at
        )
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
        product.refresh_from_db()
        self.assertEqual(product.price, Decimal("40.00"))

    # -- 3. an ended sale is not revived ---------------------------------------------------

    def test_removing_the_end_of_an_ended_sale_does_not_restart_it(self) -> None:
        product = self._with_sale(self._live_paid(), "30.00", timezone.now() - timedelta(hours=1))

        response = self._patch(product, {"discount_price": "30.00", "discount_ends_at": None})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertIsNone(product.discount_price)
        self.assertIsNone(product.active_discount_price())

    def test_resending_an_ended_sale_with_its_old_end_clears_it(self) -> None:
        ended = timezone.now() - timedelta(hours=1)
        product = self._with_sale(self._live_paid(), "30.00", ended)

        response = self._patch(
            product, {"discount_price": "30.00", "discount_ends_at": ended.isoformat()}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertIsNone(product.discount_price)
        self.assertIsNone(product.discount_ends_at)

    def test_a_new_end_date_alone_does_not_restart_an_ended_sale(self) -> None:
        product = self._with_sale(self._live_paid(), "30.00", timezone.now() - timedelta(hours=1))

        response = self._patch(
            product, {"discount_ends_at": (timezone.now() + timedelta(days=2)).isoformat()}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        product.refresh_from_db()
        self.assertIsNone(product.active_discount_price())

    def test_an_ended_sale_can_be_restarted_explicitly(self) -> None:
        product = self._with_sale(self._live_paid(), "30.00", timezone.now() - timedelta(hours=1))
        ends = timezone.now() + timedelta(days=2)

        response = self._patch(
            product, {"discount_price": "30.00", "discount_ends_at": ends.isoformat()}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.active_discount_price(), Decimal("30.00"))

    def test_an_ended_sale_does_not_block_lowering_the_price(self) -> None:
        product = self._with_sale(self._live_paid(), "30.00", timezone.now() - timedelta(hours=1))

        response = self._patch(product, {"price": "20.00"})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.price, Decimal("20.00"))
        self.assertIsNone(product.discount_price)

    def test_resending_an_unchanged_running_sale_writes_no_history(self) -> None:
        ends = timezone.now() + timedelta(days=2)
        product = self._with_sale(self._live_paid(), "30.00", ends)
        before = ProductPriceChange.objects.filter(product=product).count()

        response = self._patch(
            product, {"discount_price": "30.00", "discount_ends_at": ends.isoformat()}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(ProductPriceChange.objects.filter(product=product).count(), before)

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

    # -- 5. sale price floor ----------------------------------------------------------------

    def test_sale_price_of_zero_or_below_the_checkout_minimum_is_refused(self) -> None:
        product = self._live_paid()
        for sale in ("0.00", "0.49"):
            with self.subTest(sale=sale):
                response = self._patch(product, {"discount_price": sale})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_sale_price_equal_to_the_price_is_refused(self) -> None:
        product = self._live_paid("40.00")

        response = self._patch(product, {"discount_price": "40.00"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
