"""Packages pipeline, Phase 2 (docs/PACKAGES_PIPELINE.md): the import's packages, the preview
or 360° rule, buyer protection, the category from the Model ID's code, QA and the publish rule,
and the admin Imports panel."""

from __future__ import annotations

import tempfile
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from accounts.api_keys import CatalogApiKeyService
from accounts.models import ActivityLog
from categories.models import Category
from orders.models import Order, OrderItem
from products.catalog_import import spin_frame_keys
from products.models import Product, ProductFile
from products.services import ProductError, ProductService
from products.test_catalog_import import CatalogImportTestBase, _happy_item
from products.testing import package_media, put_pipeline_objects

ALL_KINDS = ("with_light_rig", "without_light_rig", "glb_only", "environment", "whole")


def _item(sku: str = "ELE-000001", *, kinds=("whole",), category: str = "Electronics", **overrides) -> dict:
    """A row as Model ID Tool 1.8 sends it: <ID>_<kind>.zip per package, price 0.00."""
    prefix = overrides.pop("r2_key_prefix", f"models/{sku}/")
    media = {
        "thumbnail_key": f"{prefix}previewthumb_{sku}.jpg",
        "preview_key": f"{prefix}preview_{sku}.glb",
        **package_media(prefix, sku, kinds),
    }
    media.update(overrides.pop("media", {}))
    item = _happy_item(
        model_id=sku,
        name=overrides.pop("name", f"Model {sku}"),
        category=category,
        r2_key_prefix=prefix,
        exports={},
        package_formats=["max", "fbx"],
        media=media,
    )
    item.update(overrides)
    return item


def _spin_only_item(sku: str = "ELE-000001", **overrides) -> dict:
    """RacingGamingChair's shape: a 360° and zips, no preview GLB."""
    return _item(
        sku,
        glb_checksum="",
        media={"preview_key": "", "spin_keys": spin_frame_keys(sku)},
        **overrides,
    )


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PackagesImportTestBase(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self.electronics = Category.objects.create(name="Electronics", slug="electronics")
        self._authenticate_as_admin()

    def _row(self, item: dict, *, batch_id: str = "2026-11-16-run-01") -> dict:
        response = self._post_batch([item], batch_id=batch_id)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["results"][0]

    def _packages(self, sku: str) -> dict[str, ProductFile]:
        return {
            row.package_kind: row
            for row in ProductFile.objects.filter(product__sku=sku, is_preview=False)
        }

    def _buy(self, product: Product, kind: str) -> None:
        order = Order.objects.create(
            user=self.customer_user,
            invoice_number=f"INV-{product.sku}-{kind or 'legacy'}",
            total_amount=Decimal("10.00"),
            order_status=Order.OrderStatus.PAID,
            payment_status=Order.PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=product.pk,
            package_kind=kind,
            quantity=1,
            purchase_price=Decimal("10.00"),
        )


class ImportPackagesTests(PackagesImportTestBase):
    def test_one_three_and_five_packages_make_one_row_each_with_no_price(self) -> None:
        for sku, kinds in (
            ("ELE-000001", ("whole",)),
            ("ELE-000003", ("with_light_rig", "without_light_rig", "whole")),
            ("ELE-000005", ALL_KINDS),
        ):
            with self.subTest(kinds=kinds):
                row = self._row(_item(sku, kinds=kinds))
                self.assertEqual(row["action"], "created", row)
                packages = self._packages(sku)
                self.assertEqual(set(packages), set(kinds))
                for kind, package in packages.items():
                    self.assertEqual(package.storage_path, f"models/{sku}/{sku}_{kind}.zip")
                    self.assertEqual(package.file_size, 1048576)
                    self.assertIsNone(package.price)
                self.assertEqual(Product.objects.get(sku=sku).price, Decimal("0.00"))

    def test_a_reimport_keeps_each_package_price_and_sale(self) -> None:
        kinds = ("with_light_rig", "whole")
        self._row(_item(kinds=kinds))
        ProductFile.objects.filter(package_kind="whole").update(price=Decimal("29.00"))
        ProductFile.objects.filter(package_kind="with_light_rig").update(
            price=Decimal("19.00"), discount_price=Decimal("15.00")
        )

        row = self._row(_item(kinds=kinds), batch_id="2026-11-16-run-02")

        self.assertEqual(row["action"], "updated", row)
        packages = self._packages("ELE-000001")
        self.assertEqual(packages["whole"].price, Decimal("29.00"))
        self.assertEqual(packages["with_light_rig"].price, Decimal("19.00"))
        self.assertEqual(packages["with_light_rig"].discount_price, Decimal("15.00"))

    def test_a_free_upload_has_every_package_free(self) -> None:
        sku = "ELE-000020"
        row = self._row(
            _item(sku, kinds=("glb_only", "whole"), r2_key_prefix=f"free-models/{sku}/")
        )
        self.assertEqual(row["action"], "created", row)
        packages = self._packages(sku)
        self.assertEqual(packages["glb_only"].storage_path, f"free-models/{sku}/{sku}_glb_only.zip")
        self.assertEqual({row.price for row in packages.values()}, {Decimal("0.00")})

    def test_a_wrong_package_list_is_refused(self) -> None:
        def changed(change) -> dict:
            item = _item(kinds=("with_light_rig", "whole"))
            change(item["media"])
            return item

        def entry(media, index=0):
            return media["packages"][index]

        cases = {
            # A known kind with a wrong name is an uploader fault, not an extra file (D7).
            "duplicate kind": lambda m: entry(m, 1).update(kind="with_light_rig", key=entry(m)["key"]),
            "wrong name": lambda m: entry(m).update(key="models/ELE-000001/chair.zip"),
            "another model's name": lambda m: entry(m).update(key="models/ELE-000001/ELE-000002_with_light_rig.zip"),
            "main zip not listed": lambda m: m.update(package_key="models/ELE-000001/ELE-000001_glb_only.zip"),
            "size 0": lambda m: entry(m).update(file_size=0),
            "no size": lambda m: entry(m).update(file_size=None),
            "not a zip": lambda m: entry(m).update(file_format="rar"),
            "no packages": lambda m: m.update(packages=[]),
            "only an extra zip": lambda m: m.update(
                packages=[{**entry(m), "kind": "other"}], package_key=entry(m)["key"]
            ),
        }
        for name, change in cases.items():
            with self.subTest(case=name):
                row = self._row(changed(change))
                self.assertEqual(row.get("reason"), "invalid_packages", row)
        self.assertFalse(Product.objects.filter(sku="ELE-000001").exists())

    def test_an_extra_zip_is_not_imported_and_the_admin_is_told(self) -> None:
        # D7: only the five packages are imported. Another zip warns the uploader and is named
        # in the QA notes, so an administrator can add it by hand.
        item = _item(kinds=("with_light_rig", "whole"))
        item["media"]["packages"] += [
            {"kind": "other", "key": "models/ELE-000001/ELE-000001_textures.zip",
             "file_name": "ELE-000001_textures.zip", "file_size": 10, "file_format": "zip"},
            {"kind": "", "key": "models/ELE-000001/extra.zip", "file_size": 10, "file_format": "zip"},
        ]

        row = self._row(item)

        self.assertEqual(row["action"], "created", row)
        self.assertIn("extra_file_skipped", row["warnings"])
        self.assertEqual(set(self._packages("ELE-000001")), {"with_light_rig", "whole"})
        notes = Product.objects.get(sku="ELE-000001").qa_notes
        self.assertIn("ELE-000001_textures.zip, extra.zip", notes)
        self.assertIn("Media > Packages", notes)

        # The next upload without the extra zip clears the note; other notes are kept.
        Product.objects.filter(sku="ELE-000001").update(qa_notes=f"Checked by QA.\n{notes}")
        row = self._row(_item(kinds=("with_light_rig", "whole")), batch_id="2026-11-16-run-02")
        self.assertNotIn("extra_file_skipped", row.get("warnings", []))
        self.assertEqual(Product.objects.get(sku="ELE-000001").qa_notes, "Checked by QA.")

    def test_one_missing_zip_skips_the_row(self) -> None:
        item = _item("ELE-000040", kinds=("with_light_rig", "whole"))
        put_pipeline_objects([item])
        default_storage.delete(item["media"]["packages"][0]["key"])  # that upload failed

        response = self.client.post(
            self.import_url, {"import_batch_id": "missing-zip", "items": [item]}, format="json"
        )

        self.assertEqual(response.data["results"][0]["reason"], "missing_package_object")
        self.assertFalse(Product.objects.filter(sku="ELE-000040").exists())


class BuyersKeepTheirPackagesTests(PackagesImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self._row(_item(kinds=("with_light_rig", "without_light_rig", "whole")))
        self.product = Product.objects.get(sku="ELE-000001")

    def test_a_package_nobody_bought_can_be_dropped(self) -> None:
        self._buy(self.product, "whole")
        row = self._row(_item(kinds=("without_light_rig", "whole")), batch_id="drop-unbought")
        self.assertEqual(row["action"], "updated", row)
        self.assertEqual(set(self._packages("ELE-000001")), {"without_light_rig", "whole"})

    def test_dropping_a_bought_package_is_refused(self) -> None:
        self._buy(self.product, "with_light_rig")
        row = self._row(_item(kinds=("without_light_rig", "whole")), batch_id="drop-bought")
        self.assertEqual(row.get("reason"), "package_has_buyers", row)
        self.assertIn("with_light_rig", self._packages("ELE-000001"))

    def test_an_order_from_before_packages_protects_every_package(self) -> None:
        self._buy(self.product, "")
        row = self._row(_item(kinds=("whole",)), batch_id="drop-legacy")
        self.assertEqual(row.get("reason"), "package_has_buyers", row)

    def test_a_disputed_or_unpaid_order_does_not_protect(self) -> None:
        self._buy(self.product, "with_light_rig")
        Order.objects.update(payment_status=Order.PaymentStatus.PENDING)
        row = self._row(_item(kinds=("without_light_rig", "whole")), batch_id="drop-unpaid")
        self.assertEqual(row["action"], "updated", row)

    def test_a_live_model_new_package_has_no_price_and_says_so(self) -> None:
        ProductFile.objects.filter(product=self.product).update(price=Decimal("20.00"))
        Product.objects.filter(pk=self.product.pk).update(status=Product.Status.PUBLISHED)

        row = self._row(
            _item(kinds=("with_light_rig", "without_light_rig", "whole", "glb_only")),
            batch_id="new-pkg",
        )

        self.assertEqual(row["status"], "published", row)
        self.assertIn("package_needs_price", row["warnings"])
        self.assertIsNone(self._packages("ELE-000001")["glb_only"].price)
        # The summary is the cheapest priced package; the unpriced one is not sold.
        self.assertEqual(Product.objects.get(pk=self.product.pk).price, Decimal("20.00"))


class PreviewOrSpinTests(PackagesImportTestBase):
    def test_a_model_with_a_360_and_no_preview_is_created(self) -> None:
        row = self._row(_spin_only_item())
        self.assertEqual(row["action"], "created", row)
        product = Product.objects.get(sku="ELE-000001")
        self.assertFalse(product.has_preview)
        self.assertEqual(product.preview_model, "")
        self.assertEqual(len(product.spin_images), 36)

    def test_a_model_with_no_preview_and_no_360_is_created(self) -> None:
        item = _item(glb_checksum="", media={"preview_key": "", "spin_keys": []})
        row = self._row(item)
        self.assertEqual(row["action"], "created", row)
        product = Product.objects.get(sku="ELE-000001")
        self.assertFalse(product.has_preview)
        self.assertEqual((product.preview_model, product.spin_images), ("", []))

    def test_a_partial_360_is_refused(self) -> None:
        partial = _item(
            glb_checksum="",
            media={"preview_key": "", "spin_keys": spin_frame_keys("ELE-000001")[:35]},
        )
        self.assertEqual(self._row(partial).get("reason"), "invalid_spin_keys")

    def test_qa_approves_a_model_with_no_preview_and_no_360(self) -> None:
        self._row(_item(glb_checksum="", media={"preview_key": "", "spin_keys": []}))
        product = Product.objects.get(sku="ELE-000001")
        Category.objects.filter(pk=product.category_id).update(is_active=True, pending_approval=False)

        response = self.client.post(
            reverse("products_admin:admin-product-approve", kwargs={"product_id": product.pk}),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.AWAITING_PRICE)

    def test_a_preview_needs_its_checksum(self) -> None:
        self.assertEqual(self._row(_item(glb_checksum="")).get("reason"), "missing_glb_checksum")

    def test_qa_approves_a_360_only_model_into_waiting_for_price(self) -> None:
        self._row(_spin_only_item())
        product = Product.objects.get(sku="ELE-000001")
        Category.objects.filter(pk=product.category_id).update(is_active=True, pending_approval=False)

        response = self.client.post(
            reverse("products_admin:admin-product-approve", kwargs={"product_id": product.pk}),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["status"], "awaiting_price")


class CategoryFromCodeTests(PackagesImportTestBase):
    def _category_of(self, sku: str) -> Category:
        return Product.objects.select_related("category").get(sku=sku).category

    def test_the_code_decides_whatever_the_sheet_says(self) -> None:
        self.electronics.code = "ELE"
        self.electronics.save()
        row = self._row(_item(category="Something Else"))
        self.assertEqual(row["action"], "created", row)
        self.assertNotIn("warnings", row)
        self.assertEqual(self._category_of("ELE-000001"), self.electronics)

    def test_a_category_with_no_code_is_linked_once_by_its_name(self) -> None:
        row = self._row(_item(category="  electronics "))
        self.assertEqual(row["warnings"], ["category_linked"])
        self.electronics.refresh_from_db()
        self.assertEqual(self.electronics.code, "ELE")
        # The next model with the code finds it without the name.
        row = self._row(_item("ELE-000002", category=""))
        self.assertNotIn("warnings", row)
        self.assertEqual(self._category_of("ELE-000002"), self.electronics)

    def test_a_name_that_belongs_to_another_code_is_refused(self) -> None:
        self.electronics.code = "FUR"
        self.electronics.save()
        self.assertEqual(self._row(_item()).get("reason"), "category_code_mismatch")

    def test_two_uncoded_categories_with_the_name_are_ambiguous(self) -> None:
        Category.objects.create(name="ELECTRONICS", slug="electronics-2")
        self.assertEqual(self._row(_item()).get("reason"), "category_ambiguous")

    def test_no_code_and_no_name_is_unmapped(self) -> None:
        # (A name over 255 characters is refused by the request serializer, before the import.)
        self.assertEqual(self._row(_item(category="")).get("reason"), "category_unmapped")

    def test_a_bad_code_is_an_invalid_model_id(self) -> None:
        for sku in ("E-000001", "ELECTR-000001", "E1E-000001"):
            with self.subTest(sku=sku):
                self.assertEqual(self._row(_item(sku)).get("reason"), "invalid_model_id")

    def test_a_new_category_is_created_hidden_once_and_logged(self) -> None:
        response = self._post_batch(
            [_item("OUT-000001", category="Outdoor"), _item("OUT-000002", category="Outdoor  ")],
            batch_id="2026-11-16-new-cat",
        )
        rows = response.data["results"]
        self.assertEqual([row["action"] for row in rows], ["created", "created"], rows)
        self.assertEqual([row["warnings"] for row in rows], [["category_pending_approval"]] * 2)
        category = Category.objects.get(code="OUT")
        self.assertEqual(Category.objects.filter(name__iexact="outdoor").count(), 1)
        self.assertEqual(category.name, "Outdoor")
        self.assertFalse(category.is_active)
        self.assertTrue(category.pending_approval)
        self.assertTrue(category.created_by_import)
        self.assertEqual(category.created_from_batch, "2026-11-16-new-cat")
        self.assertIsNone(category.parent)
        self.assertEqual(self._category_of("OUT-000002"), category)
        self.assertTrue(
            ActivityLog.objects.filter(action="category_import_create", target_id=str(category.pk)).exists()
        )
        # The public site never shows it.
        public = self.client.get(reverse("categories:category-list"))
        self.assertNotIn("outdoor", {row["slug"] for row in public.data["results"]})

    def test_a_refused_row_creates_no_category(self) -> None:
        item = _item("OUT-000001", category="Outdoor")
        item["media"]["packages"][0]["file_size"] = 0
        self._row(item)
        self.assertFalse(Category.objects.filter(code="OUT").exists())

    def test_a_category_switched_off_on_purpose_is_never_revived(self) -> None:
        self.electronics.is_active = False
        self.electronics.save()
        self.assertEqual(self._row(_item()).get("reason"), "category_inactive")
        self.electronics.code = "ELE"
        self.electronics.save()
        self.assertEqual(self._row(_item()).get("reason"), "category_inactive")

    def test_a_rejected_category_refuses_new_models(self) -> None:
        self._row(_item("OUT-000001", category="Outdoor"))
        Category.objects.filter(code="OUT").update(rejected_at=timezone.now())
        self.assertEqual(self._row(_item("OUT-000002", category="Outdoor")).get("reason"), "category_rejected")

    def test_a_reupload_keeps_the_category(self) -> None:
        self._row(_item())
        self.assertEqual(self._row(_item(category="Nonsense"), batch_id="run-2")["action"], "updated")
        self.assertEqual(self._category_of("ELE-000001"), self.electronics)


class ApprovalAndPublishRuleTests(PackagesImportTestBase):
    def _approve(self, product: Product):
        return self.client.post(
            reverse("products_admin:admin-product-approve", kwargs={"product_id": product.pk}),
            {},
            format="json",
        )

    def test_a_model_in_a_pending_category_cannot_be_approved(self) -> None:
        self._row(_item("OUT-000001", category="Outdoor"))
        product = Product.objects.get(sku="OUT-000001")

        response = self._approve(product)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertEqual(response.data["category"], ["Approve the new category 'Outdoor' first."])
        Category.objects.filter(code="OUT").update(is_active=True, pending_approval=False)
        self.assertEqual(self._approve(product).data["status"], "awaiting_price")

    def test_free_approval_makes_every_package_free(self) -> None:
        sku = "ELE-000030"
        self._row(_item(sku, kinds=("glb_only", "whole"), r2_key_prefix=f"free-models/{sku}/"))
        product = Product.objects.get(sku=sku)
        ProductFile.objects.filter(product=product, package_kind="whole").update(price=Decimal("5.00"))

        response = self._approve(product)

        self.assertEqual(response.data["status"], "published", response.data)
        self.assertEqual({row.price for row in self._packages(sku).values()}, {Decimal("0.00")})
        self.assertTrue(Product.objects.get(pk=product.pk).is_free)

    def _publish_errors(self, product: Product) -> dict:
        with self.assertRaises(ProductError) as caught:
            ProductService._validate_publish_ready(product, require_sku=True)
        return caught.exception.errors

    def test_publish_needs_a_price_on_every_package(self) -> None:
        self._row(_item(kinds=("with_light_rig", "whole")))
        product = Product.objects.get(sku="ELE-000001")
        ProductFile.objects.filter(package_kind="whole").update(price=Decimal("29.00"))

        errors = self._publish_errors(product)
        self.assertEqual(errors["price"], ["Set a price of at least 0.50 USD for: With Light Rig."])

        ProductFile.objects.filter(package_kind="with_light_rig").update(price=Decimal("19.00"))
        ProductService._validate_publish_ready(product, require_sku=True)

    def test_publish_refuses_a_package_sale_that_breaks_the_rules(self) -> None:
        self._row(_item())
        product = Product.objects.get(sku="ELE-000001")
        ProductFile.objects.filter(package_kind="whole").update(
            price=Decimal("20.00"), discount_price=Decimal("1.00")
        )
        errors = self._publish_errors(product)
        self.assertTrue(errors["price"][0].startswith("Whole File: its sale price 1.00 is not allowed"))

    def test_publish_needs_every_zip_in_storage_but_no_preview_or_360(self) -> None:
        self._row(_spin_only_item(kinds=("with_light_rig", "whole")))
        product = Product.objects.get(sku="ELE-000001")
        ProductFile.objects.filter(product=product).update(price=Decimal("20.00"))
        ProductService._validate_publish_ready(product, require_sku=True)  # a 360 alone is enough

        default_storage.delete("models/ELE-000001/ELE-000001_with_light_rig.zip")
        Product.objects.filter(pk=product.pk).update(spin_images=[])
        errors = self._publish_errors(Product.objects.get(pk=product.pk))
        self.assertEqual(
            errors["files"],
            ["Package file missing from storage: With Light Rig. Upload the model again."],
        )
        # No preview and no 360° is allowed: only the missing zip blocks the publish.
        self.assertNotIn("preview_model", errors)


class AdminPackageUploadTests(PackagesImportTestBase):
    """A file added in /console that is not the preview is one of the model's packages."""

    def _add(self, product: Product, kind: str):
        validated = SimpleNamespace(
            file_format="zip", extension=".zip", file=ContentFile(b"PK"), triangle_count=None
        )
        upload = SimpleUploadedFile("pack.zip", b"PK", content_type="application/zip")
        with (
            patch("products.media_service.validate_product_file_upload", return_value=validated),
            patch(
                "products.media_service.ProductMediaStorageService.save_file",
                return_value=f"products/files/{kind or 'none'}.zip",
            ),
        ):
            return ProductService.add_file(product, upload, package_kind=kind)

    def test_a_package_upload_needs_a_new_kind_and_starts_unpriced(self) -> None:
        self._row(_item())
        product = Product.objects.get(sku="ELE-000001")

        with self.assertRaises(ProductError) as no_kind:
            self._add(product, "")
        self.assertEqual(no_kind.exception.field, "package_kind")
        with self.assertRaises(ProductError) as taken:
            self._add(product, "whole")
        self.assertIn("already has a Whole File package", taken.exception.message)

        added = self._add(product, "glb_only")
        self.assertEqual(added.package_kind, "glb_only")
        self.assertIsNone(added.price)


class UploaderImportsPanelTests(PackagesImportTestBase):
    def test_every_refused_model_is_listed_with_its_name_and_the_reason_in_words(self) -> None:
        items = [_item("OUT-000001", name="Garden Bench", category=""), _item()]
        put_pipeline_objects(items)
        admin_auth = self.client._credentials
        issued = CatalogApiKeyService.create_key(name="studio-pc")
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {issued.key}")
        upload = self.client.post(
            reverse("catalog_ingest:import"),
            {"import_batch_id": "panel-1", "import_source": "3dsmax-uploader", "items": items},
            format="json",
        )
        self.assertEqual(upload.status_code, status.HTTP_200_OK, upload.data)
        self.client.credentials(**admin_auth)

        response = self.client.get(reverse("products_admin:admin-uploader-imports"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        latest = response.data["results"][0]
        self.assertEqual(latest["import_batch_id"], "panel-1")
        self.assertEqual((latest["created"], latest["skipped"]), (1, 1))
        self.assertEqual(
            latest["refused"],
            [
                {
                    "model_id": "OUT-000001",
                    "name": "Garden Bench",
                    "reason": "category_unmapped",
                    "text": "No category has the code of this ID, and the sheet has no usable category name.",
                    "action": "Set the code on the right category in /console > Categories, or fill the Category column, then upload again.",
                }
            ],
        )

    def test_only_administrators_see_the_panel(self) -> None:
        self.client.credentials()
        response = self.client.get(reverse("products_admin:admin-uploader-imports"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
