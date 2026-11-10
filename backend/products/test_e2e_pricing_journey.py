"""End-to-end pricing journey through the real API (docs/PRICING_PIPELINE.md).

Upload (uploader API key) -> QA Free/Paid sections -> Pricing page (waiting: filter, preview,
save, publish) -> shop -> sale -> cart and checkout -> the sale ends -> housekeeping and price
history -> re-upload of a live model. Each test drives the journey up to the part it checks,
as the Model Uploader, an administrator and a buyer would, through the real URLs only.

Storage is local files (a temporary MEDIA_ROOT); payments use the built-in Stripe simulation
and any real Stripe call fails the test.
"""

from __future__ import annotations

import hashlib
import unittest
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status

from accounts.api_keys import CatalogApiKeyService
from accounts.legal_service import LegalAcceptanceService
from accounts.services import AuthenticationService
from categories.models import Category
from orders.models import Order
from payments.models import CheckoutAttempt
from products.catalog_import import FREE_TO_PAID_OFF_SALE, LIVE_UPDATE_IN_QA
from products.models import Product, ProductPriceChange
from products.test_catalog_import import CatalogImportTestBase, _happy_item

FREE_SKU = "JRN-FREE-001"
LAMP_SKU = "JRN-LAMP-001"  # paid, Lighting, 5,000 polygons (low), sheet price 19.99
CHAIR_SKU = "JRN-CHAIR-001"  # paid, Furniture > Chairs, 50,000 polygons (mid), no price
BATCH = "journey-run-01"

LAMP_PRICE = "24.00"
LAMP_SALE = "17.99"  # 25% off 24.00 = 18.00, moved down to .99


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _item(sku: str, *, free: bool = False, **overrides: object) -> dict:
    """An uploader row for ``sku``: every object under models/<sku>/ (paid) or
    free-models/<sku>/ (the Free tick), like ``_free_item`` in test_catalog_reupload."""
    folder = "free-models" if free else "models"
    overrides.setdefault("glb_checksum", _checksum(sku))
    item = _happy_item(model_id=sku, r2_key_prefix=f"{folder}/{sku}/", **overrides)

    def move(key: str) -> str:
        return key.replace("models/MDL-000142/", f"{folder}/{sku}/", 1)

    item["media"] = {
        key: [move(k) for k in value]
        if isinstance(value, list)
        else move(value) if isinstance(value, str) else value
        for key, value in item["media"].items()
    }
    return item


def _row_errors(body: dict) -> dict:
    """The per-model errors of a refused save. The contract names an ``errors`` field; the
    server currently sends the map at the top level (see test_9 below), so read either."""
    return body.get("errors", body)


def _no_stripe(*_args, **_kwargs):
    raise AssertionError("The journey must never call Stripe.")


@override_settings(E2E_STRIPE_SIMULATE=True, STRIPE_SECRET_KEY="sk_test_journey_placeholder")
@patch("stripe.checkout.Session.create", side_effect=_no_stripe)
@patch("stripe.checkout.Session.retrieve", side_effect=_no_stripe)
@patch("stripe.checkout.Session.expire", side_effect=_no_stripe)
class PricingJourneyE2ETests(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self.lighting = Category.objects.create(name="Lighting", slug="lighting")
        self.uploader_key = CatalogApiKeyService.create_key(name="journey-pc", scope="models").key
        LegalAcceptanceService.record_acceptances(
            self.customer_user, LegalAcceptanceService.current_versions()
        )

    # ─── Who is calling ─────────────────────────────────────────────────────────────────

    def _as_uploader(self) -> None:
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {self.uploader_key}")

    def _as_admin(self) -> None:
        # The admin token carries the authenticator (MFA) mark, as after the console sign-in.
        access = AuthenticationService.build_tokens(self.admin_user, mfa=True)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _as_buyer(self) -> None:
        access = AuthenticationService.build_tokens(self.customer_user, mfa=False)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _as_visitor(self) -> None:
        self.client.credentials()

    # ─── Uploader ───────────────────────────────────────────────────────────────────────

    def _upload(self, items: list[dict], *, batch_id: str = BATCH) -> dict:
        from products.testing import put_pipeline_objects

        put_pipeline_objects(items)  # the uploader puts the files in storage first
        self._as_uploader()
        response = self.client.post(
            reverse("catalog_ingest:import"),
            {"import_batch_id": batch_id, "import_source": "3dsmax-uploader", "items": items},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    @staticmethod
    def _product(sku: str) -> Product:
        return Product.objects.get(sku=sku)

    # ─── Admin: QA ──────────────────────────────────────────────────────────────────────

    def _qa_skus(self, kind: str) -> set[str]:
        response = self.client.get(
            reverse("products_admin:admin-products"),
            {"status": "pending_review", "kind": kind, "page_size": 100},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return {row["sku"] for row in response.data["results"]}

    def _approve(self, product: Product, body: dict | None = None):
        return self.client.post(
            reverse("products_admin:admin-product-approve", kwargs={"product_id": product.pk}),
            body or {},
            format="json",
        )

    def _patch(self, product: Product, body: dict):
        return self.client.patch(
            reverse("products_admin:admin-product-detail", kwargs={"product_id": product.pk}),
            body,
            format="json",
        )

    # ─── Admin: Pricing page ────────────────────────────────────────────────────────────

    def _pricing_rows(self, **params) -> dict[str, dict]:
        response = self.client.get(reverse("products_admin:admin-pricing"), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return {row["sku"]: row for row in response.data["results"]}

    def _preview(self, products: list[Product], **rule):
        body = {"product_ids": [str(p.pk) for p in products], **rule}
        return self.client.post(reverse("products_admin:admin-pricing-preview"), body, format="json")

    def _apply(self, products: list[Product], token: str, confirm_count=None, **rule):
        body = {"product_ids": [str(p.pk) for p in products], "preview_token": token, **rule}
        if confirm_count is not None:
            body["confirm_count"] = confirm_count
        return self.client.post(reverse("products_admin:admin-pricing-apply"), body, format="json")

    def _preview_ok(self, products: list[Product], **rule) -> dict:
        response = self._preview(products, **rule)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _price(self, products: list[Product], confirm_count=None, **rule) -> dict:
        """Preview, then save with the preview's token (Step 1)."""
        token = self._preview_ok(products, **rule)["preview_token"]
        response = self._apply(products, token, confirm_count, **rule)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _publish(self, products: list[Product], confirm_count=None):
        ids = [str(p.pk) for p in products]
        body = {"product_ids": ids, "confirm_count": len(ids) if confirm_count is None else confirm_count}
        return self.client.post(reverse("products_admin:admin-pricing-publish"), body, format="json")

    def _history(self, product: Product) -> list[dict]:
        response = self.client.get(
            reverse("products_admin:admin-product-price-history", kwargs={"product_id": product.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["results"]

    # ─── Shop and buyer ─────────────────────────────────────────────────────────────────

    def _public_detail(self, product: Product):
        self._as_visitor()
        return self.client.get(reverse("products:product-detail", kwargs={"slug": product.slug}))

    def _public_list_row(self, product: Product) -> dict | None:
        self._as_visitor()
        response = self.client.get(self.public_list_url, {"page_size": 100})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return next((row for row in response.data["results"] if row["id"] == str(product.pk)), None)

    def _cart(self) -> dict:
        response = self.client.get(reverse("cart:cart-detail"))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _checkout(self) -> Order:
        response = self.client.post(reverse("payments:checkout"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return Order.objects.prefetch_related("items").get(pk=response.data["order_id"])

    # ─── Journey stages ─────────────────────────────────────────────────────────────────

    def _stage_uploaded(self) -> tuple[Product, Product, Product]:
        """The Model Uploader sends one free and two paid models."""
        data = self._upload(
            [
                _item(FREE_SKU, free=True, name="Journey Free Stool", polygon_count=8_000),
                _item(
                    LAMP_SKU,
                    name="Journey Desk Lamp",
                    category="Lighting",
                    subcategory="",
                    price="19.99",
                    polygon_count=5_000,
                ),
                _item(CHAIR_SKU, name="Journey Lounge Chair", price="0", polygon_count=50_000),
            ]
        )
        self.assertEqual((data["created"], data["skipped"], data["failed"]), (3, 0, 0), data)
        return self._product(FREE_SKU), self._product(LAMP_SKU), self._product(CHAIR_SKU)

    def _stage_quality_approved(self) -> tuple[Product, Product, Product]:
        free, lamp, chair = self._stage_uploaded()
        self._as_admin()
        for product in (free, lamp, chair):
            response = self._approve(product)
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        for product in (free, lamp, chair):
            product.refresh_from_db()
        return free, lamp, chair

    def _stage_lamp_live(self) -> tuple[Product, Product, Product, dict]:
        """Lamp priced by poly level and published; Chair has no price and stays waiting."""
        free, lamp, chair = self._stage_quality_approved()
        applied = self._price([lamp], rule="tier_price", tier_prices={"low": LAMP_PRICE})
        response = self._publish([lamp])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["published"], 1, response.data)
        lamp.refresh_from_db()
        return free, lamp, chair, applied

    def _start_lamp_sale(self, lamp: Product, ends_at) -> dict:
        self._as_admin()
        return self._price(
            [lamp], rule="percent_off", percent="25", round_99=True, discount_ends_at=ends_at.isoformat()
        )

    @staticmethod
    def _future(days: int = 7):
        return (timezone.now() + timedelta(days=days)).replace(microsecond=0)

    @staticmethod
    def _end_sale_in_db(product: Product) -> None:
        """Time passes: the sale end is now in the past (the stored sale is not cleared yet)."""
        Product.objects.filter(pk=product.pk).update(
            discount_ends_at=timezone.now() - timedelta(minutes=1)
        )
        product.refresh_from_db()

    # ═══ 1. Upload and QA ═══════════════════════════════════════════════════════════════

    def test_1_upload_then_qa_free_and_paid_sections(self, *_stripe) -> None:
        free, lamp, chair = self._stage_uploaded()
        for product in (free, lamp, chair):
            self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
            self.assertEqual(self._public_detail(product).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(free.price, Decimal("0.00"))  # the Free tick makes the price 0
        self.assertEqual(lamp.price, Decimal("19.99"))  # the sheet price is only a suggestion

        self._as_admin()
        self.assertEqual(self._qa_skus("free"), {FREE_SKU})
        self.assertEqual(self._qa_skus("paid"), {LAMP_SKU, CHAIR_SKU})
        rows = self.client.get(
            reverse("products_admin:admin-products"), {"status": "pending_review", "page_size": 100}
        ).data["results"]
        self.assertEqual({row["sku"]: row["upload_kind"] for row in rows},
                         {FREE_SKU: "free", LAMP_SKU: "paid", CHAIR_SKU: "paid"})

        # QA never sets a price: an approve body with a price is refused.
        refused = self._approve(lamp, {"price": "50.00"})
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST, refused.data)
        lamp.refresh_from_db()
        self.assertEqual(lamp.status, Product.Status.PENDING_REVIEW)

        # Free: approve publishes it as a free download.
        response = self._approve(free)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], Product.Status.PUBLISHED)
        public = self._public_detail(free)
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertTrue(public.data["is_free"])
        self.assertEqual(public.data["price"], "0.00")
        self.assertIsNone(public.data["discount_price"])

        # Paid: approve sends it to Waiting for price, not to the store.
        self._as_admin()
        for product in (lamp, chair):
            response = self._approve(product)
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            self.assertEqual(response.data["status"], Product.Status.AWAITING_PRICE)
            self.assertEqual(response.data["upload_kind"], "paid")
            self.assertEqual(self._public_detail(product).status_code, status.HTTP_404_NOT_FOUND)
            self._as_admin()
        lamp.refresh_from_db()
        self.assertEqual(lamp.price, Decimal("19.99"))  # approve kept the suggested price
        self.assertEqual(self._qa_skus("free"), set())
        self.assertEqual(self._qa_skus("paid"), set())
        self.assertIsNone(self._public_list_row(lamp))

    # ═══ 2-3. Pricing page: waiting -> live ═════════════════════════════════════════════

    def test_2_pricing_page_filters_prices_and_publishes(self, *_stripe) -> None:
        free, lamp, chair = self._stage_quality_approved()

        def waiting(**params) -> set[str]:
            return set(self._pricing_rows(tab="waiting", **params))

        self.assertEqual(waiting(), {LAMP_SKU, CHAIR_SKU})  # the free model never appears
        self.assertEqual(waiting(category_id=self.lighting.pk), {LAMP_SKU})
        self.assertEqual(waiting(category_id=self.furniture.pk), {CHAIR_SKU})  # includes Chairs
        self.assertEqual(waiting(subcategory_id=self.chairs.pk), {CHAIR_SKU})
        self.assertEqual(waiting(poly="low"), {LAMP_SKU})
        self.assertEqual(waiting(poly="mid"), {CHAIR_SKU})
        self.assertEqual(waiting(poly="high"), set())
        self.assertEqual(waiting(search="lounge"), {CHAIR_SKU})
        self.assertEqual(waiting(search=LAMP_SKU.lower()), {LAMP_SKU})
        self.assertEqual(waiting(import_batch_id=BATCH), {LAMP_SKU, CHAIR_SKU})
        self.assertEqual(waiting(import_batch_id="other-batch"), set())
        batches = self.client.get(reverse("products_admin:admin-pricing-batches"), {"tab": "waiting"})
        self.assertEqual(batches.data["results"], [BATCH])
        row = self._pricing_rows(tab="waiting")[LAMP_SKU]
        self.assertEqual((row["poly_tier"], row["price"], row["buyer_pays"]), ("low", "19.99", "19.99"))
        self.assertEqual(row["category"]["id"], str(self.lighting.pk))

        # Preview a price by poly level: the mid model has no price, so it gets an error row.
        preview = self._preview_ok([lamp, chair], rule="tier_price", tier_prices={"low": LAMP_PRICE})
        rows = {row["sku"]: row for row in preview["rows"]}
        self.assertEqual(rows[LAMP_SKU]["new_price"], LAMP_PRICE)
        self.assertEqual(rows[LAMP_SKU]["error"], "")
        self.assertIn("mid", rows[CHAIR_SKU]["error"])
        self.assertEqual(preview["summary"]["errors"], 1)
        # Any row error refuses the whole save, keyed by model ID.
        refused = self._apply([lamp, chair], preview["preview_token"], rule="tier_price",
                              tier_prices={"low": LAMP_PRICE})
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST, refused.data)
        self.assertIn("mid", _row_errors(refused.data)[str(chair.pk)][0])
        lamp.refresh_from_db()
        self.assertEqual(lamp.price, Decimal("19.99"))

        # Save the Lamp alone; statuses do not change on save.
        applied = self._price([lamp], rule="tier_price", tier_prices={"low": LAMP_PRICE})
        self.assertEqual((applied["models"], applied["changed"]), (1, 1))
        lamp.refresh_from_db()
        self.assertEqual(lamp.price, Decimal(LAMP_PRICE))
        self.assertEqual(lamp.status, Product.Status.AWAITING_PRICE)
        self.assertEqual(self._public_detail(lamp).status_code, status.HTTP_404_NOT_FOUND)

        # Publish both: the Lamp goes live, the Chair stays waiting with a reason.
        self._as_admin()
        wrong = self._publish([lamp, chair], confirm_count=1)
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST, wrong.data)
        response = self._publish([lamp, chair])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data["published"], response.data["failed"]), (1, 1))
        results = {row["sku"]: row for row in response.data["results"]}
        self.assertTrue(results[LAMP_SKU]["published"])
        self.assertFalse(results[CHAIR_SKU]["published"])
        self.assertIn("price", results[CHAIR_SKU]["reason"].lower())
        chair.refresh_from_db()
        self.assertEqual(chair.status, Product.Status.AWAITING_PRICE)

        # Shop: list and detail show the price, no sale.
        detail = self._public_detail(lamp)
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual((detail.data["price"], detail.data["discount_price"], detail.data["is_free"]),
                         (LAMP_PRICE, None, False))
        listed = self._public_list_row(lamp)
        self.assertIsNotNone(listed)
        self.assertEqual(listed["price"], LAMP_PRICE)
        self.assertEqual(self._public_detail(chair).status_code, status.HTTP_404_NOT_FOUND)

        self._as_admin()
        self.assertEqual(set(self._pricing_rows(tab="live")), {LAMP_SKU})
        self.assertEqual(set(self._pricing_rows(tab="waiting")), {CHAIR_SKU})
        history = self._history(lamp)
        self.assertEqual(len(history), 1)
        self.assertEqual(
            (history[0]["source"], history[0]["batch_id"], history[0]["old_price"], history[0]["new_price"]),
            ("pricing_page", applied["batch_id"], "19.99", LAMP_PRICE),
        )
        self.assertEqual(history[0]["changed_by"]["id"], str(self.admin_user.pk))

    # ═══ 4-6. Sale, cart and checkout, the sale ends, housekeeping ═════════════════════

    def test_3_sale_reaches_the_buyer_and_ends_cleanly(self, *_stripe) -> None:
        free, lamp, chair, priced = self._stage_lamp_live()
        ends_at = self._future(7)

        preview = self._preview_ok(
            [lamp], rule="percent_off", percent="25", round_99=True, discount_ends_at=ends_at.isoformat()
        )
        row = preview["rows"][0]
        self.assertEqual((row["new_price"], row["new_sale_price"], row["buyer_pays"]), (LAMP_PRICE, LAMP_SALE, LAMP_SALE))
        self.assertFalse(preview["summary"]["needs_confirmation"])
        sale = self._apply([lamp], preview["preview_token"], rule="percent_off", percent="25",
                           round_99=True, discount_ends_at=ends_at.isoformat())
        self.assertEqual(sale.status_code, status.HTTP_200_OK, sale.data)
        sale_batch = sale.data["batch_id"]
        live = self._pricing_rows(tab="live")[LAMP_SKU]
        self.assertTrue(live["discount_active"])
        self.assertEqual((live["discount_price"], live["buyer_pays"]), (LAMP_SALE, LAMP_SALE))

        # Shop: list and detail show the sale price and its end.
        detail = self._public_detail(lamp).data
        self.assertEqual((detail["price"], detail["discount_price"]), (LAMP_PRICE, LAMP_SALE))
        self.assertEqual(parse_datetime(detail["discount_ends_at"]), ends_at)
        listed = self._public_list_row(lamp)
        self.assertEqual(listed["discount_price"], LAMP_SALE)
        self.assertEqual(parse_datetime(listed["discount_ends_at"]), ends_at)

        # Buyer: the cart and a checkout during the sale use the sale price.
        self._as_buyer()
        added = self.client.post(
            reverse("cart:cart-detail"), {"product_type": "product", "product_id": str(lamp.pk)}, format="json"
        )
        self.assertIn(added.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED), added.data)
        cart = self._cart()
        self.assertEqual(cart["items"][0]["unit_price"], LAMP_SALE)
        self.assertEqual(cart["items"][0]["catalog"]["discount_price"], LAMP_SALE)
        self.assertEqual(cart["total"], LAMP_SALE)
        during = self._checkout()
        self.assertEqual([item.purchase_price for item in during.items.all()], [Decimal(LAMP_SALE)])

        # The sale ends (its end passes; the maintenance loop has not run yet).
        self._end_sale_in_db(lamp)
        detail = self._public_detail(lamp).data
        self.assertEqual((detail["discount_price"], detail["discount_ends_at"]), (None, None))
        self.assertEqual(self._public_list_row(lamp)["discount_price"], None)
        self._as_buyer()
        cart = self._cart()
        self.assertEqual(cart["items"][0]["unit_price"], LAMP_PRICE)
        self.assertIsNone(cart["items"][0]["catalog"]["discount_price"])
        self.assertEqual(cart["total"], LAMP_PRICE)

        # A new checkout makes a new order at the normal price (the sale-price order is not reused).
        after = self._checkout()
        self.assertNotEqual(after.pk, during.pk)
        self.assertEqual(after.total_amount, Decimal(LAMP_PRICE))
        self.assertEqual([item.purchase_price for item in after.items.all()], [Decimal(LAMP_PRICE)])
        payload = CheckoutAttempt.objects.get(order=after).request_payload
        self.assertEqual([line["price_data"]["unit_amount"] for line in payload["line_items"]], [2400])
        confirmed = self.client.post(reverse("payments:confirm"), {"order_id": str(after.pk)}, format="json")
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK, confirmed.data)
        after.refresh_from_db()
        self.assertEqual(after.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(after.total_amount, Decimal(LAMP_PRICE))

        # Admin view before housekeeping: the stored sale is there but not active.
        self._as_admin()
        live = self._pricing_rows(tab="live")[LAMP_SKU]
        self.assertEqual((live["discount_price"], live["discount_active"], live["buyer_pays"]),
                         (LAMP_SALE, False, LAMP_PRICE))

        # Housekeeping clears the ended sale and writes history.
        out = StringIO()
        call_command("end_expired_discounts", stdout=out)
        self.assertIn("expired_sales_ended=1", out.getvalue())
        lamp.refresh_from_db()
        self.assertEqual((lamp.price, lamp.discount_price, lamp.discount_ends_at), (Decimal(LAMP_PRICE), None, None))
        ended = ProductPriceChange.objects.get(product=lamp, source=ProductPriceChange.Source.SALE_ENDED)
        self.assertIsNone(ended.changed_by)
        self.assertEqual(ended.old_discount_price, Decimal(LAMP_SALE))
        call_command("end_expired_discounts", stdout=StringIO())  # safe to repeat
        self.assertEqual(ProductPriceChange.objects.filter(product=lamp, source="sale_ended").count(), 1)

        history = self._history(lamp)
        self.assertEqual([(row["source"], row["batch_id"]) for row in history], [
            ("sale_ended", ""),
            ("pricing_page", sale_batch),
            ("pricing_page", priced["batch_id"]),
        ])
        self.assertEqual((history[0]["old_discount_price"], history[0]["new_discount_price"]), (LAMP_SALE, None))
        self.assertIsNone(history[0]["changed_by"])
        self.assertEqual((history[1]["old_discount_price"], history[1]["new_discount_price"]), (None, LAMP_SALE))

    # ═══ 7. Re-upload of live and waiting models ════════════════════════════════════════

    def test_4_reupload_of_a_live_paid_model_stays_on_sale_until_qa(self, *_stripe) -> None:
        free, lamp, chair, _priced = self._stage_lamp_live()
        self._as_admin()
        self._price([chair], rule="set_price", price="40.00")
        history_before = ProductPriceChange.objects.filter(product=lamp).count()

        data = self._upload(
            [_item(LAMP_SKU, name="Sheet Name v2", category="Lighting", subcategory="", price="99.00",
                   polygon_count=5_000, glb_checksum=_checksum("lamp v2")),
             _item(CHAIR_SKU, price="0", polygon_count=50_000, glb_checksum=_checksum("chair v2"))],
            batch_id="journey-run-02",
        )
        rows = {row["model_id"]: row for row in data["results"]}
        self.assertEqual((rows[LAMP_SKU]["action"], rows[LAMP_SKU]["status"]), ("updated", "published"))
        self.assertIn(LIVE_UPDATE_IN_QA, rows[LAMP_SKU]["warnings"])
        lamp.refresh_from_db()
        self.assertEqual((lamp.status, lamp.pending_update, lamp.price),
                         (Product.Status.PUBLISHED, True, Decimal(LAMP_PRICE)))
        # A waiting model uploaded again goes back to QA, keeping the price saved for it.
        chair.refresh_from_db()
        self.assertEqual((chair.status, chair.price), (Product.Status.PENDING_REVIEW, Decimal("40.00")))

        # Still on the store at its price while the update waits in QA's Paid section.
        detail = self._public_detail(lamp)
        self.assertEqual((detail.status_code, detail.data["price"]), (status.HTTP_200_OK, LAMP_PRICE))
        self._as_admin()
        self.assertEqual(self._qa_skus("paid"), {LAMP_SKU, CHAIR_SKU})
        self.assertEqual(self._qa_skus("free"), set())
        self.assertTrue(self._pricing_rows(tab="live")[LAMP_SKU]["pending_update"])

        # Approve keeps it published and keeps the price; the chair waits for its price again.
        response = self._approve(lamp)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        lamp.refresh_from_db()
        self.assertEqual((lamp.status, lamp.pending_update, lamp.price),
                         (Product.Status.PUBLISHED, False, Decimal(LAMP_PRICE)))
        self.assertEqual(ProductPriceChange.objects.filter(product=lamp).count(), history_before)
        self.assertEqual(self._approve(chair).data["status"], Product.Status.AWAITING_PRICE)
        self.assertEqual(self._qa_skus("paid"), set())
        response = self._publish([chair])
        self.assertEqual(response.data["published"], 1, response.data)
        self.assertEqual(self._public_detail(chair).data["price"], "40.00")

    def test_5_live_free_model_uploaded_as_paid_leaves_the_store(self, *_stripe) -> None:
        free, _lamp, _chair = self._stage_quality_approved()
        self.assertEqual(free.status, Product.Status.PUBLISHED)

        data = self._upload([_item(FREE_SKU, polygon_count=8_000, glb_checksum=_checksum("paid now"))],
                            batch_id="journey-run-03")
        self.assertIn(FREE_TO_PAID_OFF_SALE, data["results"][0]["warnings"])
        free.refresh_from_db()
        self.assertEqual(free.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(self._public_detail(free).status_code, status.HTTP_404_NOT_FOUND)
        self._as_visitor()
        download = self.client.get(reverse("products:product-free-download", kwargs={"slug": free.slug}))
        self.assertEqual(download.status_code, status.HTTP_404_NOT_FOUND)

        self._as_admin()
        self.assertIn(FREE_SKU, self._qa_skus("paid"))
        self.assertEqual(self._approve(free).data["status"], Product.Status.AWAITING_PRICE)
        self.assertIn(FREE_SKU, self._pricing_rows(tab="waiting"))

    # ═══ 8. Loopholes ═══════════════════════════════════════════════════════════════════

    def test_6_customers_cannot_use_the_pricing_routes(self, *_stripe) -> None:
        free, lamp, chair, _priced = self._stage_lamp_live()
        self._as_buyer()
        ids = [str(chair.pk)]
        calls = [
            self.client.get(reverse("products_admin:admin-pricing"), {"tab": "waiting"}),
            self.client.get(reverse("products_admin:admin-pricing-batches"), {"tab": "waiting"}),
            self._preview([chair], rule="set_price", price="9.00"),
            self._apply([chair], "0" * 64, rule="set_price", price="9.00"),
            self.client.post(reverse("products_admin:admin-pricing-publish"),
                             {"product_ids": ids, "confirm_count": 1}, format="json"),
            self.client.get(reverse("products_admin:admin-product-price-history",
                                    kwargs={"product_id": lamp.pk})),
            self._approve(chair),
            self._patch(lamp, {"price": "1.00"}),
        ]
        self.assertEqual([c.status_code for c in calls], [status.HTTP_403_FORBIDDEN] * len(calls))
        # The uploader key is not an admin login either.
        self._as_uploader()
        self.assertIn(
            self.client.get(reverse("products_admin:admin-pricing"), {"tab": "waiting"}).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
        chair.refresh_from_db()
        lamp.refresh_from_db()
        self.assertEqual((chair.status, chair.price), (Product.Status.AWAITING_PRICE, Decimal("0.00")))
        self.assertEqual(lamp.price, Decimal(LAMP_PRICE))

    def test_7_prices_below_the_minimum_free_models_and_price_zero_are_refused(self, *_stripe) -> None:
        free, lamp, chair, _priced = self._stage_lamp_live()

        # set_price 0 is refused by the request check; below 0.50 is an error row.
        self.assertEqual(self._preview([chair], rule="set_price", price="0").status_code,
                         status.HTTP_400_BAD_REQUEST)
        low = self._preview_ok([chair], rule="set_price", price="0.40")
        self.assertIn("0.50", low["rows"][0]["error"])
        refused = self._apply([chair], low["preview_token"], rule="set_price", price="0.40")
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST, refused.data)
        self.assertIn(str(chair.pk), _row_errors(refused.data))
        # A sale that would go below 0.50 is refused too.
        tiny = self._preview_ok([lamp], rule="amount_off", amount="23.60")
        self.assertIn("0.50", tiny["rows"][0]["error"])

        # A free model has no price: error row, nothing saved, never in the tabs.
        free_preview = self._preview_ok([free], rule="set_price", price="9.00")
        self.assertIn("Free models", free_preview["rows"][0]["error"])
        refused = self._apply([free], free_preview["preview_token"], rule="set_price", price="9.00")
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(FREE_SKU, self._pricing_rows(tab="live"))
        free_sale = self._preview_ok([free], rule="percent_off", percent="10")
        self.assertNotEqual(free_sale["rows"][0]["error"], "")

        # An admin edit cannot make a paid upload free.
        patched = self._patch(lamp, {"price": "0.00"})
        self.assertEqual(patched.status_code, status.HTTP_400_BAD_REQUEST, patched.data)
        self._price([chair], rule="set_price", price="40.00")
        patched = self._patch(chair, {"price": "0"})
        self.assertEqual(patched.status_code, status.HTTP_400_BAD_REQUEST, patched.data)
        # ...nor publish it, nor send it to Waiting for price.
        self.assertEqual(self._patch(chair, {"status": "published"}).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self._patch(chair, {"status": "pending_review"}).status_code,
                         status.HTTP_400_BAD_REQUEST)

        for product, price in ((free, "0.00"), (lamp, LAMP_PRICE), (chair, "40.00")):
            product.refresh_from_db()
            self.assertEqual(product.price, Decimal(price), product.sku)
        self.assertEqual(free.status, Product.Status.PUBLISHED)
        self.assertEqual(chair.status, Product.Status.AWAITING_PRICE)

    def test_8_stale_previews_and_big_sales_need_a_new_preview_or_confirmation(self, *_stripe) -> None:
        free, lamp, chair, _priced = self._stage_lamp_live()

        # Another save after the preview: 409, nothing saved.
        stale = self._preview_ok([chair], rule="set_price", price="45.00")["preview_token"]
        self._price([chair], rule="set_price", price="41.00")
        conflict = self._apply([chair], stale, rule="set_price", price="45.00")
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT, conflict.data)
        chair.refresh_from_db()
        self.assertEqual(chair.price, Decimal("41.00"))

        # A sale ending between the preview and the save: 409.
        self._start_lamp_sale(lamp, self._future(7))
        token = self._preview_ok([lamp], rule="set_price", price="30.00")["preview_token"]
        self._end_sale_in_db(lamp)
        conflict = self._apply([lamp], token, rule="set_price", price="30.00")
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT, conflict.data)

        # A re-upload between the preview and the save (the model went back to QA): 409.
        token = self._preview_ok([chair], rule="set_price", price="44.00")["preview_token"]
        self._upload([_item(CHAIR_SKU, price="0", polygon_count=50_000, glb_checksum=_checksum("c3"))],
                     batch_id="journey-run-04")
        self._as_admin()
        conflict = self._apply([chair], token, rule="set_price", price="44.00")
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT, conflict.data)
        chair.refresh_from_db()
        self.assertEqual((chair.status, chair.price), (Product.Status.PENDING_REVIEW, Decimal("41.00")))

        # More than 50% off needs the number of models typed in.
        rule = {"rule": "percent_off", "percent": "60"}
        preview = self._preview_ok([lamp], **rule)
        self.assertTrue(preview["summary"]["needs_confirmation"])
        for confirm in (None, 2):
            refused = self._apply([lamp], preview["preview_token"], confirm, **rule)
            self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST, refused.data)
        lamp.refresh_from_db()
        self.assertEqual(lamp.price, Decimal(LAMP_PRICE))
        self.assertNotEqual(lamp.discount_price, Decimal("9.60"))
        saved = self._apply([lamp], preview["preview_token"], 1, **rule)
        self.assertEqual(saved.status_code, status.HTTP_200_OK, saved.data)
        lamp.refresh_from_db()
        self.assertEqual((lamp.discount_price, lamp.discount_ends_at), (Decimal("9.60"), None))
        # More than 90% off is never allowed.
        self.assertEqual(self._preview([lamp], rule="percent_off", percent="91").status_code,
                         status.HTTP_400_BAD_REQUEST)

    # ═══ Bugs found by the journey (expected failures until fixed) ══════════════════════

    @unittest.expectedFailure
    def test_9_refused_save_reports_row_errors_in_an_errors_field(self, *_stripe) -> None:
        # BUG: docs/PRICING_PIPELINE.md (apply): "Any row error refuses the whole save (400).
        # The `errors` field is keyed by model ID." The server sends the model-ID map at the top
        # level instead (domain_error_body returns exc.errors as the whole body), with no
        # `errors` key and without the general message. products/pricing.py:465-469.
        _free, lamp, chair = self._stage_quality_approved()
        preview = self._preview_ok([lamp, chair], rule="tier_price", tier_prices={"low": LAMP_PRICE})
        refused = self._apply([lamp, chair], preview["preview_token"], rule="tier_price",
                              tier_prices={"low": LAMP_PRICE})
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("errors", refused.data)
        self.assertEqual(set(refused.data["errors"]), {str(chair.pk)})

    @unittest.expectedFailure
    def test_10_sheet_sale_cannot_go_below_the_minimum_or_past_90_percent(self, *_stripe) -> None:
        # BUG: the uploader sheet's discount_price is stored on the first upload without the
        # sale rules (catalog_import._gate_item checks only the price; create_product runs
        # _validate_pricing but not _validate_sale_minimum; QA approve skips price checks; and
        # pricing._publish_error checks only price >= 0.50). A sheet row price 29.99 /
        # discount_price 0.10 goes QA approve -> Publish selected -> the store sells it for
        # 0.10 (99.7% off): below the 0.50 checkout minimum and past the 90% cap, with no
        # price ever saved on the Pricing page.
        data = self._upload(
            [_item("JRN-SHEET-SALE", name="Journey Sheet Sale", price="29.99", discount_price="0.10",
                   polygon_count=20_000)],
            batch_id="journey-sheet",
        )
        if data["created"] == 0:
            return  # refused at import: the rule holds
        product = self._product("JRN-SHEET-SALE")
        self._as_admin()
        self.assertEqual(self._approve(product).status_code, status.HTTP_200_OK)
        self._publish([product])
        product.refresh_from_db()
        if product.status != Product.Status.PUBLISHED:
            return  # Publish refused it: the rule holds
        buyer_pays = product.effective_price()
        self.assertGreaterEqual(buyer_pays, Decimal("0.50"))
        self.assertLessEqual((product.price - buyer_pays) / product.price, Decimal("0.90"))
