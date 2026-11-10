"""QA status flow (docs/PRICING_PIPELINE.md, Part 1 "Statuses").

Free uploads publish on QA approval; paid uploads wait for their price (awaiting_price);
live updates stay published. QA never sets a paid price.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.files.storage import default_storage
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from accounts.models import AdminNotification
from categories.models import Category
from products.catalog_import import LIVE_UPDATE_IN_QA
from products.errors import ProductError
from products.models import Product, ProductFile, ProductPriceChange
from products.services import ProductService
from products.test_catalog_import import CatalogImportTestBase, _happy_item
from products.test_catalog_reupload import _free_item

_NEW_CHECKSUM = "c" * 64
_SKU = "MDL-000142"


class QAStatusFlowTests(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self._authenticate_as_admin()
        self.admin_list_url = reverse("products_admin:admin-products")

    # -- helpers ---------------------------------------------------------------------------

    def _upload(self, item: dict, *, batch_id: str = "2026-11-10-run-01") -> Product:
        response = self._post_batch([item], batch_id=batch_id)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["created"] + response.data["updated"], 1, response.data)
        return Product.objects.get(sku=_SKU)

    def _upload_paid(self) -> Product:
        product = self._upload(_happy_item())
        self.assertEqual(ProductService.upload_kind(product), "paid")
        return product

    def _upload_free(self) -> Product:
        product = self._upload(_free_item())
        self.assertEqual(ProductService.upload_kind(product), "free")
        return product

    def _url(self, name: str, product: Product) -> str:
        return reverse(f"products_admin:admin-product-{name}", kwargs={"product_id": product.pk})

    def _approve(self, product: Product, payload: dict | None = None):
        return self.client.post(self._url("approve", product), payload or {}, format="json")

    def _reject(self, product: Product, reason: str = "Broken textures"):
        return self.client.post(self._url("reject", product), {"reason": reason}, format="json")

    def _patch(self, product: Product, data: dict):
        return self.client.patch(self._url("detail", product), data, format="json")

    def _awaiting_price(self) -> Product:
        product = self._upload_paid()
        response = self._approve(product)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.AWAITING_PRICE)
        return product

    def _live_paid(self, price: str = "49.00") -> Product:
        """A paid model on sale: QA approved, then priced and published (Part 2's job)."""
        product = self._awaiting_price()
        Product.objects.filter(pk=product.pk).update(
            status=Product.Status.PUBLISHED, price=Decimal(price)
        )
        product.refresh_from_db()
        return product

    def _public_slugs(self) -> set[str]:
        credentials = self.client._credentials
        self.client.credentials()
        try:
            response = self.client.get(self.public_list_url)
        finally:
            self.client.credentials(**credentials)
        return {row["slug"] for row in response.data["results"]}

    # -- pending_review (free) -> published -----------------------------------------------

    def test_free_upload_approve_publishes(self) -> None:
        product = self._upload_free()

        with patch("products.views.log_admin_action") as audit:
            response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "published")
        self.assertEqual(response.data["upload_kind"], "free")
        self.assertEqual(response.data["price"], "0.00")
        audit.assert_called_once()
        self.assertEqual(
            audit.call_args.kwargs["metadata"], {"result": "published", "upload_kind": "free"}
        )
        self.assertIn(product.slug, self._public_slugs())
        # Already free: nothing changed, so no price history.
        self.assertFalse(ProductPriceChange.objects.filter(product=product).exists())

    def test_free_approval_with_a_price_sets_zero_and_records_history(self) -> None:
        product = self._upload_free()
        ends = timezone.now() + timedelta(days=3)
        Product.objects.filter(pk=product.pk).update(
            price=Decimal("5.00"), discount_price=Decimal("4.00"), discount_ends_at=ends
        )

        response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertEqual(product.price, Decimal("0.00"))
        self.assertIsNone(product.discount_price)
        self.assertIsNone(product.discount_ends_at)
        change = ProductPriceChange.objects.get(product=product)
        self.assertEqual(change.source, ProductPriceChange.Source.QA_APPROVAL)
        self.assertEqual(change.changed_by_id, self.admin_user.pk)
        self.assertEqual(change.old_price, Decimal("5.00"))
        self.assertEqual(change.new_price, Decimal("0.00"))
        self.assertEqual(change.old_discount_price, Decimal("4.00"))
        self.assertIsNone(change.new_discount_price)
        self.assertEqual(change.old_discount_ends_at, ends)
        self.assertIsNone(change.new_discount_ends_at)

    # -- pending_review (paid) -> awaiting_price ------------------------------------------

    def test_paid_upload_approve_waits_for_price(self) -> None:
        product = self._upload_paid()
        Product.objects.filter(pk=product.pk).update(reject_reason="Old reason")

        with patch("products.views.log_admin_action") as audit:
            response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "awaiting_price")
        self.assertEqual(response.data["upload_kind"], "paid")
        self.assertEqual(
            audit.call_args.kwargs["metadata"],
            {"result": "awaiting_price", "upload_kind": "paid"},
        )
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.AWAITING_PRICE)
        self.assertEqual(product.price, Decimal("29.99"))
        self.assertEqual(product.reviewed_by_id, self.admin_user.pk)
        self.assertIsNotNone(product.reviewed_at)
        self.assertEqual(product.reject_reason, "")
        self.assertFalse(ProductPriceChange.objects.filter(product=product).exists())
        # Never public while it waits for its price.
        self.assertNotIn(product.slug, self._public_slugs())
        self.client.credentials()
        detail = self.client.get(reverse("products:product-detail", kwargs={"slug": product.slug}))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_paid_approval_skips_the_price_checks(self) -> None:
        product = self._upload_paid()
        # Price 0 (or under the checkout minimum) is fine: the Pricing page sets it later.
        for price in ("0.00", "0.10"):
            with self.subTest(price=price):
                Product.objects.filter(pk=product.pk).update(
                    price=Decimal(price), status=Product.Status.PENDING_REVIEW
                )
                response = self._approve(product)
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
                self.assertEqual(response.data["status"], "awaiting_price")
                self.assertEqual(response.data["price"], price)

    def test_paid_approval_runs_the_other_publish_gates(self) -> None:
        product = self._upload_paid()
        package = ProductFile.objects.get(product=product, is_preview=False)
        default_storage.delete(package.storage_path)
        Product.objects.filter(pk=product.pk).update(preview_model="")

        response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("files", response.data)
        self.assertIn("preview_model", response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)

    def test_paid_approval_resolves_the_review_notification(self) -> None:
        product = self._upload_paid()
        self.assertTrue(
            AdminNotification.objects.filter(
                product=product, kind="model_review", resolved_at=None
            ).exists()
        )

        self._approve(product)

        self.assertFalse(
            AdminNotification.objects.filter(
                product=product, kind="model_review", resolved_at=None
            ).exists()
        )

    def test_awaiting_price_cannot_be_approved_again(self) -> None:
        product = self._awaiting_price()

        response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)

    # -- live update ----------------------------------------------------------------------

    def test_live_paid_update_approve_keeps_the_price(self) -> None:
        product = self._live_paid("49.00")
        upload = self._post_batch([_happy_item(glb_checksum=_NEW_CHECKSUM)], batch_id="live-02")
        row = upload.data["results"][0]
        self.assertEqual(row["status"], "published")
        self.assertIn(LIVE_UPDATE_IN_QA, row["warnings"])

        response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertFalse(product.pending_update)
        self.assertEqual(product.price, Decimal("49.00"))
        self.assertFalse(ProductPriceChange.objects.filter(product=product).exists())

    def test_live_free_update_approve_stays_published(self) -> None:
        product = self._upload_free()
        self.assertEqual(self._approve(product).status_code, status.HTTP_200_OK)
        self._post_batch([_free_item(glb_checksum=_NEW_CHECKSUM)], batch_id="live-02")
        product.refresh_from_db()
        self.assertTrue(product.pending_update)

        response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "published")
        self.assertFalse(response.data["pending_update"])

    # -- reject ---------------------------------------------------------------------------

    def test_reject_from_pending_review_awaiting_price_and_live_update(self) -> None:
        for setup in ("pending_review", "awaiting_price", "live_update"):
            with self.subTest(setup=setup):
                Product.objects.filter(sku=_SKU).delete()
                if setup == "pending_review":
                    product = self._upload_paid()
                elif setup == "awaiting_price":
                    product = self._awaiting_price()
                else:
                    product = self._live_paid()
                    self._post_batch(
                        [_happy_item(glb_checksum=_NEW_CHECKSUM)], batch_id="live-02"
                    )

                response = self._reject(product)

                self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
                product.refresh_from_db()
                self.assertEqual(product.status, Product.Status.REJECTED)
                self.assertFalse(product.pending_update)
                self.assertEqual(product.reject_reason, "Broken textures")

    def test_requeue_is_unchanged(self) -> None:
        product = self._awaiting_price()
        requeue = self.client.post(self._url("requeue", product), {}, format="json")
        self.assertEqual(requeue.status_code, status.HTTP_400_BAD_REQUEST)

        self._reject(product)
        requeue = self.client.post(self._url("requeue", product), {}, format="json")

        self.assertEqual(requeue.status_code, status.HTTP_200_OK, requeue.data)
        self.assertEqual(requeue.data["status"], "pending_review")

    # -- re-upload ------------------------------------------------------------------------

    def test_reupload_of_awaiting_price_goes_back_to_qa(self) -> None:
        product = self._awaiting_price()

        response = self._post_batch([_happy_item(glb_checksum=_NEW_CHECKSUM)], batch_id="run-02")

        row = response.data["results"][0]
        self.assertEqual(row["action"], "updated", row)
        self.assertEqual(row["status"], "pending_review")
        self.assertNotIn(LIVE_UPDATE_IN_QA, row.get("warnings", []))
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertFalse(product.pending_update)
        self.assertEqual(product.glb_checksum, _NEW_CHECKSUM)

    # -- admin edits ----------------------------------------------------------------------

    def test_awaiting_price_can_go_to_draft_or_archived(self) -> None:
        for target in ("draft", "archived"):
            with self.subTest(target=target):
                Product.objects.filter(sku=_SKU).delete()
                product = self._awaiting_price()
                response = self._patch(product, {"status": target})
                self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
                self.assertEqual(response.data["status"], target)

    def test_direct_edit_cannot_set_awaiting_price_or_published(self) -> None:
        product = self._upload_paid()
        response = self._patch(product, {"status": "awaiting_price"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)

        Product.objects.filter(pk=product.pk).update(status=Product.Status.DRAFT)
        response = self._patch(product, {"status": "awaiting_price"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        Product.objects.filter(pk=product.pk).update(status=Product.Status.AWAITING_PRICE)
        response = self._patch(product, {"status": "published", "price": "49.00"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.AWAITING_PRICE)

        # Other edits of a waiting model still work (the status is not changed).
        response = self._patch(product, {"name": "Renamed Chair", "status": "awaiting_price"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "awaiting_price")

    def test_create_cannot_start_awaiting_price(self) -> None:
        response = self.client.post(
            self.admin_list_url,
            {
                "category_id": str(self.chairs.pk),
                "name": "Manual Chair",
                "price": "10.00",
                "status": "awaiting_price",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Product.objects.filter(name="Manual Chair").exists())

    # -- approve body ---------------------------------------------------------------------

    def test_approve_refuses_pricing_or_price(self) -> None:
        product = self._upload_paid()
        for payload in (
            {"pricing": "paid", "price": "49.00"},
            {"pricing": "free"},
            {"price": "10.00"},
        ):
            with self.subTest(payload=payload):
                response = self._approve(product, payload)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                for name in payload:
                    self.assertIn("Pricing page", str(response.data[name]))
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.price, Decimal("29.99"))


class QAStatusTransitionTableTests(TestCase):
    """Every row of the contract's status table, at the transition-table level."""

    def _allowed(self, current: str, new: str) -> bool:
        try:
            ProductService._validate_status_transition(current, new)
        except ProductError:
            return False
        return True

    def test_awaiting_price_rows(self) -> None:
        S = Product.Status
        self.assertTrue(self._allowed(S.PENDING_REVIEW, S.AWAITING_PRICE))
        for target in (S.PUBLISHED, S.REJECTED, S.PENDING_REVIEW, S.DRAFT, S.ARCHIVED):
            with self.subTest(target=target):
                self.assertTrue(self._allowed(S.AWAITING_PRICE, target))
        for source in (S.DRAFT, S.PUBLISHED, S.REJECTED, S.ARCHIVED):
            with self.subTest(source=source):
                self.assertFalse(self._allowed(source, S.AWAITING_PRICE))


class UploadKindAndKindFilterTests(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self._authenticate_as_admin()
        self.url = reverse("products_admin:admin-products")
        self.category = Category.objects.get(slug="chairs")

    def _product(self, name: str, *, zip_path: str | None, **fields) -> Product:
        product = Product.objects.create(
            category=self.category,
            name=name,
            slug=Product.build_slug(name),
            price=fields.pop("price", Decimal("10.00")),
            status=fields.pop("status", Product.Status.PENDING_REVIEW),
            **fields,
        )
        if zip_path:
            ProductFile.objects.create(
                product=product,
                file_name="package.zip",
                file_format="zip",
                file_size=10,
                storage_path=zip_path,
            )
        return product

    def _names(self, params: dict) -> set[str]:
        response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return {row["name"] for row in response.data["results"]}

    def test_upload_kind_free_paid_and_no_files(self) -> None:
        free = self._product("Free Chair", zip_path="free-models/F1/package.zip")
        paid = self._product("Paid Chair", zip_path="models/P1/package.zip")
        empty = self._product("Empty Chair", zip_path=None)
        # A preview under free-models/ does not make a model free.
        preview_only = self._product("Preview Chair", zip_path="models/P2/package.zip")
        ProductFile.objects.create(
            product=preview_only,
            file_name="preview.glb",
            file_format="glb",
            file_size=10,
            storage_path="free-models/P2/preview.glb",
            is_preview=True,
        )
        expected = {free: "free", paid: "paid", empty: "paid", preview_only: "paid"}
        for product, kind in expected.items():
            with self.subTest(product=product.name):
                detail = self.client.get(
                    reverse(
                        "products_admin:admin-product-detail", kwargs={"product_id": product.pk}
                    )
                )
                self.assertEqual(detail.data["upload_kind"], kind)
                self.assertEqual(ProductService.upload_kind(product), kind)

    def test_kind_splits_the_qa_queue_including_live_updates(self) -> None:
        S = Product.Status
        self._product("Free New", zip_path="free-models/A/package.zip")
        self._product("Paid New", zip_path="models/B/package.zip")
        self._product(
            "Free Live Update",
            zip_path="free-models/C/package.zip",
            status=S.PUBLISHED,
            pending_update=True,
        )
        self._product(
            "Paid Live Update", zip_path="models/D/package.zip", status=S.PUBLISHED, pending_update=True
        )
        self._product("Paid Waiting", zip_path="models/E/package.zip", status=S.AWAITING_PRICE)
        self._product("Free Live", zip_path="free-models/F/package.zip", status=S.PUBLISHED)
        self._product("Paid No Files", zip_path=None)

        queue = {"status": "pending_review"}
        self.assertEqual(
            self._names({**queue, "kind": "free"}), {"Free New", "Free Live Update"}
        )
        self.assertEqual(
            self._names({**queue, "kind": "paid"}),
            {"Paid New", "Paid Live Update", "Paid No Files"},
        )
        self.assertEqual(
            self._names(queue), {"Free New", "Paid New", "Free Live Update", "Paid Live Update", "Paid No Files"}
        )
        self.assertEqual(self._names({"status": "awaiting_price"}), {"Paid Waiting"})
        self.assertEqual(
            self._names({"kind": "free"}), {"Free New", "Free Live Update", "Free Live"}
        )
        # A blank kind is no filter; anything else is refused.
        self.assertEqual(len(self._names({**queue, "kind": ""})), 5)
        response = self.client.get(self.url, {**queue, "kind": "cheap"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kind", response.data)

    def test_upload_kind_adds_no_queries_to_the_admin_list(self) -> None:
        def count() -> int:
            with CaptureQueriesContext(connection) as queries:
                response = self.client.get(self.url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            return len(queries)

        self._product("One", zip_path="free-models/1/package.zip")
        self._product("Two", zip_path="models/2/package.zip")
        few = count()
        for index in range(3, 7):
            self._product(f"More {index}", zip_path=f"models/{index}/package.zip")

        self.assertEqual(count(), few)
