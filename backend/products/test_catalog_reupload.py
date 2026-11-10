"""A re-upload updates a model's files; the administrator's text, price and category stay."""

from __future__ import annotations

from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse

from categories.models import Category
from products.catalog_import import (
    CONSOLE_TEXT_KEPT,
    LIVE_UPDATE_IN_QA,
    PRICE_NEEDED,
    strip_folder_listing,
)
from products.models import Product
from products.test_catalog_import import CatalogImportTestBase, _happy_item

_NEW_CHECKSUM = "b" * 64
_FOLDERS = "Folders in model folder:- BLENDER- FBX- GLB- RENDER_IMAGES- TEXTURE- THUMBNAIL"


def _free_item(**overrides: object) -> dict:
    """The same model ticked Free in the uploader: every file under free-models/<sku>/."""
    item = _happy_item(r2_key_prefix="free-models/MDL-000142/", **overrides)
    item["media"] = {
        key: [k.replace("models/", "free-models/", 1) for k in value]
        if isinstance(value, list)
        else value.replace("models/", "free-models/", 1) if isinstance(value, str) else value
        for key, value in item["media"].items()
    }
    return item


class CatalogReuploadTests(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self._authenticate_as_admin()

    def _first_upload(self, item: dict | None = None) -> Product:
        response = self._post_batch([item or _happy_item()])
        self.assertEqual(response.data["created"], 1, response.data)
        return Product.objects.get(sku="MDL-000142")

    def _reupload(self, item: dict) -> dict:
        response = self._post_batch([item], batch_id="2026-09-04-run-02")
        self.assertEqual(response.data["updated"], 1, response.data)
        return response.data["results"][0]

    def test_reupload_keeps_the_admin_text_and_updates_the_files(self) -> None:
        product = self._first_upload()
        lamps = Category.objects.create(name="Lamps", slug="lamps")
        Product.objects.filter(pk=product.pk).update(
            name="Oak Studio Chair",
            description="Written in the console.",
            short_description="Console short text.",
            price=Decimal("45.00"),
            category=lamps,
            license_type=Product.LicenseType.EXTENDED,
            software_used="Blender",
            rigged=True,
        )

        row = self._reupload(
            _happy_item(
                name="Sheet Name v2",
                description="Sheet description v2",
                short_description="Sheet short v2",
                price="99.00",
                license_type="editorial",
                software_used="Maya",
                rigged=False,
                animated=True,
                glb_checksum=_NEW_CHECKSUM,
                polygon_count=20000,
            )
        )

        self.assertIn(CONSOLE_TEXT_KEPT, row["warnings"])
        product.refresh_from_db()
        # The administrator's version stays.
        self.assertEqual(product.name, "Oak Studio Chair")
        self.assertEqual(product.description, "Written in the console.")
        self.assertEqual(product.short_description, "Console short text.")
        self.assertEqual(product.price, Decimal("45.00"))
        self.assertEqual(product.category_id, lamps.pk)
        self.assertEqual(product.license_type, Product.LicenseType.EXTENDED)
        self.assertEqual(product.software_used, "Blender")
        self.assertTrue(product.rigged)
        self.assertFalse(product.animated)
        # The files and what is measured from them follow the upload, and QA looks again.
        self.assertEqual(product.glb_checksum, _NEW_CHECKSUM)
        self.assertEqual(product.polygon_count, 20000)
        self.assertEqual(product.import_batch_id, "2026-09-04-run-02")
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)

    def test_unchanged_sheet_text_gives_no_warning(self) -> None:
        self._first_upload()

        row = self._reupload(_happy_item(glb_checksum=_NEW_CHECKSUM))

        self.assertNotIn(CONSOLE_TEXT_KEPT, row.get("warnings", []))

    def test_reupload_with_an_unknown_category_still_updates(self) -> None:
        self._first_upload()

        self._reupload(_happy_item(category="DoesNotExist"))

        self.assertEqual(Product.objects.get(sku="MDL-000142").category_id, self.chairs.pk)

    def test_rejected_model_returns_to_qa_with_its_console_text(self) -> None:
        product = self._first_upload()
        Product.objects.filter(pk=product.pk).update(name="Fixed Name", status=Product.Status.REJECTED)

        self._reupload(_happy_item())

        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.name, "Fixed Name")

    def test_reupload_into_the_free_folder_makes_it_free(self) -> None:
        product = self._first_upload()
        Product.objects.filter(pk=product.pk).update(price=Decimal("45.00"), discount_price=Decimal("40.00"))

        self._reupload(_free_item())

        product.refresh_from_db()
        self.assertEqual(product.price, Decimal("0.00"))
        self.assertIsNone(product.discount_price)

    def test_reupload_from_the_free_folder_to_paid_asks_for_a_price(self) -> None:
        self._first_upload(_free_item())

        row = self._reupload(_happy_item())

        self.assertIn(PRICE_NEEDED, row["warnings"])
        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.price, Decimal("0.00"))
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)

    def test_first_upload_strips_the_folder_listing(self) -> None:
        product = self._first_upload(
            _happy_item(
                description="Black boot with laces. " + _FOLDERS,
                short_description="Black boot." + _FOLDERS,
            )
        )

        self.assertEqual(product.description, "Black boot with laces.")
        self.assertEqual(product.short_description, "Black boot.")


class LiveModelUpdateTests(CatalogImportTestBase):
    """A published model uploaded again stays on sale and waits in the QA queue."""

    def setUp(self) -> None:
        super().setUp()
        self._authenticate_as_admin()
        response = self._post_batch([_happy_item()])
        self.assertEqual(response.data["created"], 1, response.data)
        self.product = Product.objects.get(sku="MDL-000142")
        approve = self.client.post(self._qa_url("approve"), {}, format="json")
        self.assertEqual(approve.status_code, 200, approve.data)
        self.product.refresh_from_db()
        # A paid model waits for its price after QA; the Pricing page then publishes it.
        self.assertEqual(self.product.status, Product.Status.AWAITING_PRICE)
        Product.objects.filter(pk=self.product.pk).update(status=Product.Status.PUBLISHED)
        self.product.refresh_from_db()
        self.public_url = reverse("products:product-detail", kwargs={"slug": self.product.slug})

    def _qa_url(self, action: str) -> str:
        return reverse(f"products_admin:admin-product-{action}", kwargs={"product_id": self.product.pk})

    def _queue_skus(self) -> list[str]:
        response = self.client.get(reverse("products_admin:admin-products"), {"status": "pending_review"})
        self.assertEqual(response.status_code, 200)
        return [row["sku"] for row in response.data["results"]]

    def test_reupload_keeps_the_model_on_sale_and_puts_it_in_the_qa_queue(self) -> None:
        response = self._post_batch([_happy_item(glb_checksum=_NEW_CHECKSUM)], batch_id="live-02")

        row = response.data["results"][0]
        self.assertEqual(row["action"], "updated", row)
        self.assertEqual(row["status"], "published")
        self.assertIn(LIVE_UPDATE_IN_QA, row["warnings"])
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.PUBLISHED)
        self.assertTrue(self.product.pending_update)
        self.assertEqual(self.product.glb_checksum, _NEW_CHECKSUM)
        self.assertIn("MDL-000142", self._queue_skus())
        detail = self.client.get(reverse("products_admin:admin-product-detail", kwargs={"product_id": self.product.pk}))
        self.assertTrue(detail.data["pending_update"])
        self.client.credentials()
        self.assertEqual(self.client.get(self.public_url).status_code, 200)

    def test_approving_the_update_keeps_it_published(self) -> None:
        self._post_batch([_happy_item(glb_checksum=_NEW_CHECKSUM)], batch_id="live-02")

        response = self.client.post(self._qa_url("approve"), {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.PUBLISHED)
        self.assertFalse(self.product.pending_update)
        self.assertNotIn("MDL-000142", self._queue_skus())

    def test_rejecting_the_update_takes_it_off_sale(self) -> None:
        self._post_batch([_happy_item(glb_checksum=_NEW_CHECKSUM)], batch_id="live-02")

        response = self.client.post(self._qa_url("reject"), {"reason": "Renders are broken"}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.REJECTED)
        self.assertFalse(self.product.pending_update)
        self.assertEqual(self.product.reject_reason, "Renders are broken")
        self.client.credentials()
        self.assertEqual(self.client.get(self.public_url).status_code, 404)

    def test_a_live_model_without_an_update_cannot_be_approved_or_rejected_again(self) -> None:
        self.assertEqual(self.client.post(self._qa_url("approve"), {}, format="json").status_code, 400)
        reject = self.client.post(self._qa_url("reject"), {"reason": "x"}, format="json")
        self.assertEqual(reject.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.PUBLISHED)

    def test_a_refused_reupload_still_flags_the_live_model_for_qa(self) -> None:
        response = self._post_batch([_happy_item(qa_status="Not ready")], batch_id="live-03")

        row = response.data["results"][0]
        self.assertEqual(row["action"], "skipped")
        self.assertEqual(row["reason"], "qa_not_ready")
        self.assertIn(LIVE_UPDATE_IN_QA, row["warnings"])
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.PUBLISHED)
        self.assertTrue(self.product.pending_update)
        self.assertIn("Re-upload live-03 was refused (qa_not_ready)", self.product.qa_notes)

        # A later upload that passes replaces the refusal note; the update still waits for QA.
        self._post_batch([_happy_item(glb_checksum=_NEW_CHECKSUM)], batch_id="live-04")
        self.product.refresh_from_db()
        self.assertNotIn("was refused", self.product.qa_notes)
        self.assertTrue(self.product.pending_update)

    def test_a_refused_upload_of_a_new_model_flags_nothing(self) -> None:
        response = self._post_batch(
            [_happy_item(model_id="MDL-000900", r2_key_prefix="models/MDL-000900/", qa_status="Not ready")]
        )

        self.assertNotIn(LIVE_UPDATE_IN_QA, response.data["results"][0].get("warnings", []))
        self.product.refresh_from_db()
        self.assertFalse(self.product.pending_update)


class StripFolderListingTests(TestCase):
    def test_removes_the_trailing_listing(self) -> None:
        cases = {
            "Television with a slim base.Folders in model folder:- BLENDER- FBX": "Television with a slim base.",
            "Boot.\n\nfolders in model folder: - BLENDER_FILE\n - FBX": "Boot.",
            "Plain text with no list.": "Plain text with no list.",
            _FOLDERS: "",
            "": "",
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(strip_folder_listing(text), expected)


class StripFolderListingsCommandTests(TestCase):
    def setUp(self) -> None:
        category = Category.objects.create(name="Shoes", slug="shoes")
        self.product = Product.objects.create(
            category=category,
            name="Boot",
            slug="boot",
            sku="CLO-000001",
            price=Decimal("10.00"),
            status=Product.Status.PUBLISHED,
            description="Black boot. " + _FOLDERS,
            short_description="Boot",
        )

    def test_dry_run_changes_nothing(self) -> None:
        out = StringIO()

        call_command("strip_folder_listings", stdout=out)

        self.assertIn("would clean CLO-000001", out.getvalue())
        self.product.refresh_from_db()
        self.assertTrue(self.product.description.endswith("THUMBNAIL"))

    def test_apply_saves_the_cleaned_description(self) -> None:
        out = StringIO()

        call_command("strip_folder_listings", "--apply", stdout=out)

        self.assertIn("Cleaned 1 product(s).", out.getvalue())
        self.product.refresh_from_db()
        self.assertEqual(self.product.description, "Black boot.")
        self.assertEqual(self.product.short_description, "Boot")
