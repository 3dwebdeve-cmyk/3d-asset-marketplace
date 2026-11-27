"""End-to-end pricing journey through the real API (docs/PRICING_PIPELINE.md).

Upload (uploader API key) -> QA Free/Paid sections -> Pricing page (waiting: filter, calculate,
publish) -> shop -> sale -> cart and checkout -> the sale ends -> housekeeping and price
history -> re-upload of a live model. Each test drives the journey up to the part it checks,
as the Model Uploader, an administrator and a buyer would, through the real URLs only.

Storage is local files (a temporary MEDIA_ROOT); payments use the built-in Stripe simulation
and any real Stripe call fails the test.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

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
from products.models import Product, ProductFile, ProductPriceChange
from products.packages import sync_summary_price
from products.price_history import PriceState, record_price_change
from products.test_catalog_import import CatalogImportTestBase, _happy_item
from products.testing import moved_media

# A Model ID's code (JRF in JRF-FREE-001) belongs to one category, so each category has its own.
FREE_SKU = "JRF-FREE-001"  # free, Furniture
LAMP_SKU = "JRL-LAMP-001"  # paid, Lighting, 5,000 polygons (low), sheet price 19.99 (not read)
CHAIR_SKU = "JRC-CHAIR-001"  # paid, Furniture > Chairs, 50,000 polygons (mid), no price
BATCH = "journey-run-01"

LAMP_PRICE = "24.00"
LAMP_SALE = "17.99"
# The Pricing page's boxes: one rate, one percent per package. The Lamp has 1.2 hours, so its
# GLB Only package costs 1.2 x 20 x 100% = 24.00; the Chair has 2 hours, so 40.00.
RATE = "20"
PERCENTS = {
    "with_light_rig": "60",
    "without_light_rig": "50",
    "glb_only": "100",
    "3ds_max": "40",
    "environment": "30",
}
LAMP_HOURS = Decimal("1.2")
CHAIR_HOURS = Decimal("2")


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _item(sku: str, *, free: bool = False, **overrides: object) -> dict:
    """An uploader row for ``sku``: every object under models/<sku>/ (paid) or
    free-models/<sku>/ (the Free tick), like ``_free_item`` in test_catalog_reupload."""
    folder = "free-models" if free else "models"
    overrides.setdefault("glb_checksum", _checksum(sku))
    item = _happy_item(model_id=sku, r2_key_prefix=f"{folder}/{sku}/", **overrides)
    media = moved_media(item["media"], "models/MDL-000142/", f"{folder}/{sku}/")
    # The zips are named after the Model ID too (<ID>_<kind>.zip).
    item["media"] = moved_media(media, "MDL-000142_", f"{sku}_")
    # A model is sold per single package (Whole File is not priced): this one is uploaded as GLB Only.
    item["media"] = moved_media(item["media"], "_whole.zip", "_glb_only.zip")
    for package in item["media"]["packages"]:
        package["kind"] = "glb_only"
    return item


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

    @staticmethod
    def _package(product: Product) -> ProductFile:
        return ProductFile.objects.get(product=product, package_kind="glb_only")

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

    def _body(self, products: list[Product], **extra) -> dict:
        return {"product_ids": [str(p.pk) for p in products], "rate": RATE, "percents": PERCENTS, **extra}

    def _calculate(self, products: list[Product], **extra):
        return self.client.post(
            reverse("products_admin:admin-pricing-calculate"), self._body(products, **extra), format="json"
        )

    def _calculate_ok(self, products: list[Product], **extra) -> dict:
        response = self._calculate(products, **extra)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _publish(self, products: list[Product], confirm_count=None, token=None, **extra):
        """Calculate, then publish with that calculation's token (what the page does)."""
        if token is None:
            token = self._calculate_ok(products, **extra)["preview_token"]
        body = self._body(
            products,
            preview_token=token,
            confirm_count=len(products) if confirm_count is None else confirm_count,
            **extra,
        )
        return self.client.post(reverse("products_admin:admin-pricing-publish"), body, format="json")

    @staticmethod
    def _set_hours(product: Product, hours: Decimal) -> None:
        Product.objects.filter(pk=product.pk).update(hours_spent=hours)

    def _set_package_price(self, product: Product, price: str, sale: str | None = None, ends_at=None) -> None:
        """Save a package price (and sale) with history, as a past Pricing page run would have."""
        package = self._package(product)
        before = PriceState.of(package)
        package.price = Decimal(price)
        package.discount_price = Decimal(sale) if sale else None
        package.discount_ends_at = ends_at
        package.save(update_fields=["price", "discount_price", "discount_ends_at", "updated_at"])
        record_price_change(
            package, before, source=ProductPriceChange.Source.PRICING_PAGE,
            actor=self.admin_user, batch_id="journey-saved",
        )
        sync_summary_price(product)

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
        response = self.client.post(reverse("payments:checkout"), {"withdrawal_waiver": True}, format="json")
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
                _item(CHAIR_SKU, name="Journey Lounge Chair", category="Chairs", price="0",
                      polygon_count=50_000),
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
        """Lamp priced and published; Chair has no hours and stays waiting."""
        free, lamp, chair = self._stage_quality_approved()
        self._set_hours(lamp, LAMP_HOURS)
        response = self._publish([lamp])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["published"], 1, response.data)
        lamp.refresh_from_db()
        return free, lamp, chair, response.data

    def _start_lamp_sale(self, lamp: Product, ends_at) -> None:
        self._as_admin()
        self._set_package_price(lamp, LAMP_PRICE, sale=LAMP_SALE, ends_at=ends_at)

    @staticmethod
    def _future(days: int = 7):
        return (timezone.now() + timedelta(days=days)).replace(microsecond=0)

    @staticmethod
    def _end_sale_in_db(product: Product) -> None:
        """Time passes: the sale end is now in the past (the stored sale is not cleared yet).
        Sales live on the packages; the summary follows them."""
        ended = timezone.now() - timedelta(minutes=1)
        ProductFile.objects.filter(product=product, discount_price__isnull=False).update(
            discount_ends_at=ended
        )
        Product.objects.filter(pk=product.pk).update(discount_ends_at=ended)
        product.refresh_from_db()

    # ═══ 1. Upload and QA ═══════════════════════════════════════════════════════════════

    def test_1_upload_then_qa_free_and_paid_sections(self, *_stripe) -> None:
        free, lamp, chair = self._stage_uploaded()
        for product in (free, lamp, chair):
            self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
            self.assertEqual(self._public_detail(product).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(free.price, Decimal("0.00"))  # the Free tick makes the price 0
        # The sheet's price is never read: the paid packages wait for the Pricing page.
        self.assertIsNone(self._package(lamp).price)

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
        self.assertIsNone(self._package(lamp).price)  # approve never sets a price
        self.assertEqual(self._qa_skus("free"), set())
        self.assertEqual(self._qa_skus("paid"), set())
        self.assertIsNone(self._public_list_row(lamp))

    # ═══ 2-3. Pricing page: waiting -> live ═════════════════════════════════════════════

    def test_2_pricing_page_filters_calculates_and_publishes(self, *_stripe) -> None:
        free, lamp, chair = self._stage_quality_approved()

        def waiting(**params) -> set[str]:
            return set(self._pricing_rows(tab="waiting", **params))

        self.assertEqual(waiting(), {LAMP_SKU, CHAIR_SKU})  # the free model never appears
        self.assertEqual(waiting(category_id=self.lighting.pk), {LAMP_SKU})
        self.assertEqual(waiting(category_id=self.furniture.pk), {CHAIR_SKU})  # includes Chairs
        self.assertEqual(waiting(subcategory_id=self.chairs.pk), {CHAIR_SKU})
        self.assertEqual(waiting(search="lounge"), {CHAIR_SKU})
        self.assertEqual(waiting(search=LAMP_SKU.lower()), {LAMP_SKU})
        self.assertEqual(waiting(import_batch_id=BATCH), {LAMP_SKU, CHAIR_SKU})
        self.assertEqual(waiting(import_batch_id="other-batch"), set())
        batches = self.client.get(reverse("products_admin:admin-pricing-batches"), {"tab": "waiting"})
        self.assertEqual(batches.data["results"], [BATCH])
        row = self._pricing_rows(tab="waiting")[LAMP_SKU]
        # The sheet's 19.99 is never read: the package has no price until the Pricing page
        # prices it, and the model's summary stays 0.00 ("Not set" on the page).
        self.assertEqual(row["price"], "0.00")
        whole = next(item for item in row["packages"] if item["kind"] == "glb_only")
        self.assertEqual((whole["price"], whole["buyer_pays"]), (None, None))
        self.assertEqual(row["category"]["id"], str(self.lighting.pk))

        # The hours come with the upload or are typed on the page.
        hours = self.client.post(
            reverse("products_admin:admin-pricing-hours"),
            {"items": [{"id": str(lamp.pk), "hours_spent": str(LAMP_HOURS)}]},
            format="json",
        )
        self.assertEqual(hours.data, {"models": 1, "changed": 1})
        self.assertEqual(self._pricing_rows(tab="waiting")[LAMP_SKU]["hours_spent"], "1.20")

        # Calculate: the Lamp is priced, the Chair has no hours so it has an error row.
        calculated = self._calculate_ok([lamp, chair])
        rows = {row["sku"]: row for row in calculated["rows"]}
        self.assertEqual({item["kind"]: item["price"] for item in rows[LAMP_SKU]["packages"]}, {"glb_only": LAMP_PRICE})
        self.assertEqual(rows[LAMP_SKU]["error"], "")
        self.assertIn("hours", rows[CHAIR_SKU]["error"])
        self.assertEqual(calculated["summary"]["errors"], 1)
        self.assertIsNone(self._package(lamp).price)  # calculating saves nothing

        # Publish both: the Lamp is priced and goes live, the Chair stays waiting with a reason.
        wrong = self._publish([lamp, chair], confirm_count=1)
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST, wrong.data)
        response = self._publish([lamp, chair])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual((response.data["published"], response.data["failed"]), (1, 1))
        results = {row["sku"]: row for row in response.data["results"]}
        self.assertTrue(results[LAMP_SKU]["published"])
        self.assertFalse(results[CHAIR_SKU]["published"])
        self.assertIn("hours", results[CHAIR_SKU]["reason"].lower())
        chair.refresh_from_db()
        self.assertEqual(chair.status, Product.Status.AWAITING_PRICE)
        self.assertIsNone(self._package(chair).price)

        # Shop: list and detail show the price, no sale.
        lamp.refresh_from_db()
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
            ("pricing_page", response.data["batch_id"], None, LAMP_PRICE),
        )
        self.assertEqual(history[0]["changed_by"]["id"], str(self.admin_user.pk))

    # ═══ 4-6. Sale, cart and checkout, the sale ends, housekeeping ═════════════════════

    def test_3_sale_reaches_the_buyer_and_ends_cleanly(self, *_stripe) -> None:
        free, lamp, chair, priced = self._stage_lamp_live()
        ends_at = self._future(7)

        self._start_lamp_sale(lamp, ends_at)
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
            reverse("cart:cart-detail"), {"product_type": "product", "product_id": str(lamp.pk), "package_kind": "glb_only"}, format="json"
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
            ("pricing_page", "journey-saved"),
            ("pricing_page", priced["batch_id"]),
        ])
        self.assertEqual((history[0]["old_discount_price"], history[0]["new_discount_price"]), (LAMP_SALE, None))
        self.assertIsNone(history[0]["changed_by"])
        self.assertEqual((history[1]["old_discount_price"], history[1]["new_discount_price"]), (None, LAMP_SALE))

    # ═══ 7. Re-upload of live and waiting models ════════════════════════════════════════

    def test_4_reupload_of_a_live_paid_model_stays_on_sale_until_qa(self, *_stripe) -> None:
        free, lamp, chair, _priced = self._stage_lamp_live()
        self._as_admin()
        self._set_hours(chair, CHAIR_HOURS)
        self._set_package_price(chair, "40.00")
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
            self._calculate([chair]),
            self._publish([chair], token="0" * 64),
            self.client.post(reverse("products_admin:admin-pricing-hours"),
                             {"items": [{"id": ids[0], "hours_spent": "9"}]}, format="json"),
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

        # A package that rounds below 0.50 is an error row, and publish leaves the model waiting.
        self._set_hours(chair, Decimal("0.01"))
        low = self._calculate_ok([chair])
        self.assertIn("0.50", low["rows"][0]["error"])
        refused = self._publish([chair]).data["results"][0]
        self.assertFalse(refused["published"])
        self.assertIn("0.50", refused["reason"])
        chair.refresh_from_db()
        self.assertEqual(chair.status, Product.Status.AWAITING_PRICE)

        # A free model has no price: error row, nothing saved, never in the tabs.
        free_row = self._calculate_ok([free])["rows"][0]
        self.assertNotEqual(free_row["error"], "")  # it is live (or free), not waiting for a price
        self.assertFalse(self._publish([free]).data["results"][0]["published"])
        self.assertNotIn(FREE_SKU, self._pricing_rows(tab="live"))

        # An admin edit cannot make a paid upload free.
        patched = self._patch(lamp, {"price": "0.00"})
        self.assertEqual(patched.status_code, status.HTTP_400_BAD_REQUEST, patched.data)
        self._set_package_price(chair, "40.00")
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

    def test_8_a_stale_calculation_is_refused(self, *_stripe) -> None:
        free, lamp, chair, _priced = self._stage_lamp_live()
        self._set_hours(chair, CHAIR_HOURS)

        # Hours typed after the calculation: 409, nothing saved.
        token = self._calculate_ok([chair])["preview_token"]
        self._set_hours(chair, Decimal("3"))
        conflict = self._publish([chair], token=token)
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT, conflict.data)
        self.assertIsNone(self._package(chair).price)

        # A re-upload between the calculation and the publish (the model went back to QA): 409.
        token = self._calculate_ok([chair])["preview_token"]
        self._upload([_item(CHAIR_SKU, category="Chairs", price="0", polygon_count=50_000,
                            glb_checksum=_checksum("c3"))],
                     batch_id="journey-run-04")
        self._as_admin()
        conflict = self._publish([chair], token=token)
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT, conflict.data)
        chair.refresh_from_db()
        self.assertEqual(chair.status, Product.Status.PENDING_REVIEW)

    def test_10_sheet_sale_is_ignored_and_never_reaches_the_store(self, *_stripe) -> None:
        # The upload never reads the sheet's price or sale: a 0.10 sheet sale never reaches
        # the store. The packages wait unpriced until the Pricing page prices them (1.5 h x 20).
        data = self._upload(
            [_item("JRF-SHEET-SALE", name="Journey Sheet Sale", price="29.99", discount_price="0.10",
                   polygon_count=20_000)],
            batch_id="journey-sheet",
        )
        self.assertEqual(data["created"], 1, data)
        product = self._product("JRF-SHEET-SALE")
        whole = self._package(product)
        self.assertEqual((whole.price, whole.discount_price), (None, None))
        self.assertIsNone(product.discount_price)
        self._as_admin()
        self.assertEqual(self._approve(product).status_code, status.HTTP_200_OK)
        self._set_hours(product, Decimal("1.5"))
        self._publish([product])
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertEqual(product.effective_price(), Decimal("30.00"))
