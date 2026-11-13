"""360° spin frames in the catalog import (media.spin_keys -> Product.spin_images)."""

from __future__ import annotations

import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from rest_framework import status

from products.catalog_import import spin_frame_keys
from products.models import Product
from products.test_catalog_import import CatalogImportTestBase, _happy_item, _image_bytes
from products.testing import put_pipeline_objects

_VERSIONED = r"\?v=[0-9a-f]{12}$"


def _spin_item(sku: str = "FUR-000123", *, free: bool = False, **media: object) -> dict:
    """A pipeline row with a 360°: the frames are under 360/<ID>/ for paid and free alike."""
    folder = f"free-models/{sku}/" if free else f"models/{sku}/"
    item_media: dict = {
        "thumbnail_key": f"{folder}previewthumb_{sku}.jpg",
        "preview_key": f"{folder}preview_{sku}.glb",
        "package_key": f"{folder}{sku}.zip",
        "package_file_size": 1048576,
        "gallery_keys": [f"{folder}render_{sku}_01.jpg"],
        "spin_keys": spin_frame_keys(sku),
    }
    item_media.update(media)
    return _happy_item(model_id=sku, r2_key_prefix=folder, media=item_media)


def _without_spin_keys(item: dict) -> dict:
    """The same row as an older plugin sends it: no spin_keys at all."""
    item["media"] = {key: value for key, value in item["media"].items() if key != "spin_keys"}
    return item


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CatalogImportSpinTests(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self._authenticate_as_admin()

    @staticmethod
    def _put(key: str, data: bytes) -> None:
        if default_storage.exists(key):
            default_storage.delete(key)
        default_storage.save(key, ContentFile(data))

    @staticmethod
    def _key(url: str) -> str:
        return url.split("/media/", 1)[-1].split("?", 1)[0]

    def _result(self, response) -> dict:
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data["results"][0]

    # --- accepted ---------------------------------------------------------------------

    def test_36_frames_are_stored_as_versioned_urls_in_order(self) -> None:
        row = self._result(self._post_batch([_spin_item()]))

        self.assertEqual(row["action"], "created", row)
        product = Product.objects.get(sku="FUR-000123")
        self.assertEqual(len(product.spin_images), 36)
        self.assertEqual([self._key(url) for url in product.spin_images], spin_frame_keys("FUR-000123"))
        for url in product.spin_images:
            self.assertRegex(url, _VERSIONED)

    def test_a_free_model_keeps_its_frames_under_360(self) -> None:
        row = self._result(self._post_batch([_spin_item("FUR-000124", free=True)]))

        self.assertEqual(row["action"], "created", row)
        product = Product.objects.get(sku="FUR-000124")
        self.assertEqual(product.price, 0)
        self.assertEqual(self._key(product.spin_images[0]), "360/FUR-000124/360_FUR-000124_01.jpg")

    def test_a_model_without_a_360_gets_an_empty_spin(self) -> None:
        self._result(self._post_batch([_spin_item("FUR-000125", spin_keys=[])]))
        self.assertEqual(Product.objects.get(sku="FUR-000125").spin_images, [])

        self._result(self._post_batch([_without_spin_keys(_spin_item("FUR-000126"))]))
        self.assertEqual(Product.objects.get(sku="FUR-000126").spin_images, [])

    # --- refused ----------------------------------------------------------------------

    def test_a_wrong_frame_list_skips_the_row(self) -> None:
        sku = "FUR-000127"
        frames = spin_frame_keys(sku)
        cases = {
            "35 frames": frames[:35],
            "37 frames": [*frames, frames[0]],
            "wrong order": [frames[1], frames[0], *frames[2:]],
            "another model's frames": spin_frame_keys("FUR-000999"),
            "under models/": [f"models/{sku}/{key.rsplit('/', 1)[-1]}" for key in frames],
            "under free-models/": [f"free-models/{sku}/{key.rsplit('/', 1)[-1]}" for key in frames],
            "png frames": [key.replace(".jpg", ".png") for key in frames],
            "a blank key": ["", *frames[1:]],
        }
        for label, keys in cases.items():
            with self.subTest(label):
                row = self._result(self._post_batch([_spin_item(sku, spin_keys=keys)]))
                self.assertEqual(row["action"], "skipped", row)
                self.assertEqual(row["reason"], "invalid_spin_keys")
                self.assertFalse(Product.objects.filter(sku=sku).exists())

    def test_a_missing_frame_skips_the_row(self) -> None:
        sku = "FUR-000128"
        item = _spin_item(sku)
        # Every file is uploaded except frame 17.
        put_pipeline_objects([item])
        default_storage.delete(f"360/{sku}/360_{sku}_17.jpg")
        response = self.client.post(
            self.import_url,
            {"import_batch_id": "2026-11-13-run-01", "import_source": "catalog-bridge", "items": [item]},
            format="json",
        )

        row = self._result(response)
        self.assertEqual(row["action"], "skipped", row)
        self.assertEqual(row["reason"], "missing_spin_object")
        self.assertFalse(Product.objects.filter(sku=sku).exists())

    def test_a_broken_frame_skips_the_row(self) -> None:
        sku = "FUR-000129"
        self._put(f"360/{sku}/360_{sku}_05.jpg", b"<html>not an image</html>")

        row = self._result(self._post_batch([_spin_item(sku)]))

        self.assertEqual(row["action"], "skipped", row)
        self.assertEqual(row["reason"], "invalid_spin_image")
        self.assertFalse(Product.objects.filter(sku=sku).exists())

    # --- re-uploads -------------------------------------------------------------------

    def test_absent_spin_keys_keep_the_spin_and_an_empty_list_clears_it(self) -> None:
        sku = "FUR-000130"
        self._result(self._post_batch([_spin_item(sku)]))
        first = Product.objects.get(sku=sku).spin_images
        self.assertEqual(len(first), 36)

        row = self._result(
            self._post_batch([_without_spin_keys(_spin_item(sku))], batch_id="2026-11-13-run-02")
        )
        self.assertEqual(row["action"], "updated", row)
        self.assertEqual(Product.objects.get(sku=sku).spin_images, first)

        row = self._result(
            self._post_batch([_spin_item(sku, spin_keys=[])], batch_id="2026-11-13-run-03")
        )
        self.assertEqual(row["action"], "updated", row)
        self.assertEqual(Product.objects.get(sku=sku).spin_images, [])

    def test_a_reuploaded_frame_gets_a_new_url(self) -> None:
        sku = "FUR-000131"
        self._result(self._post_batch([_spin_item(sku)]))
        first = Product.objects.get(sku=sku).spin_images

        self._put(f"360/{sku}/360_{sku}_01.jpg", _image_bytes("JPEG", (10, 200, 10)))
        self._result(self._post_batch([_spin_item(sku)], batch_id="2026-11-13-run-02"))

        second = Product.objects.get(sku=sku).spin_images
        self.assertNotEqual(first[0], second[0])
        self.assertEqual(self._key(first[0]), self._key(second[0]))
        self.assertEqual(first[1:], second[1:])

    def test_a_live_model_gets_its_new_spin_and_waits_for_review(self) -> None:
        sku = "FUR-000132"
        self._result(self._post_batch([_spin_item(sku, spin_keys=[])]))
        Product.objects.filter(sku=sku).update(status=Product.Status.PUBLISHED)

        row = self._result(self._post_batch([_spin_item(sku)], batch_id="2026-11-13-run-02"))

        self.assertEqual(row["action"], "updated", row)
        product = Product.objects.get(sku=sku)
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertTrue(product.pending_update)
        self.assertEqual(len(product.spin_images), 36)

    def test_a_refused_spin_leaves_a_live_model_unchanged(self) -> None:
        sku = "FUR-000133"
        self._result(self._post_batch([_spin_item(sku)]))
        Product.objects.filter(sku=sku).update(status=Product.Status.PUBLISHED)
        before = Product.objects.get(sku=sku).spin_images

        row = self._result(
            self._post_batch(
                [_spin_item(sku, spin_keys=spin_frame_keys(sku)[:35])], batch_id="2026-11-13-run-02"
            )
        )

        self.assertEqual(row["reason"], "invalid_spin_keys")
        self.assertEqual(Product.objects.get(sku=sku).spin_images, before)

    # --- API --------------------------------------------------------------------------

    def test_public_api_shows_the_spin_and_the_360_flag(self) -> None:
        self._result(self._post_batch([_spin_item("FUR-000134"), _spin_item("FUR-000135", spin_keys=[])]))
        Product.objects.filter(sku__in=["FUR-000134", "FUR-000135"]).update(
            status=Product.Status.PUBLISHED
        )
        self.client.credentials()

        listing = self.client.get(self.public_list_url)
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        flags = {row["slug"]: row["has_360"] for row in listing.data["results"]}
        with_spin = Product.objects.get(sku="FUR-000134")
        without_spin = Product.objects.get(sku="FUR-000135")
        self.assertIs(flags[with_spin.slug], True)
        self.assertIs(flags[without_spin.slug], False)
        self.assertNotIn("spin_images", listing.data["results"][0])

        detail = self.client.get(reverse("products:product-detail", args=[with_spin.slug]))
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["spin_images"], with_spin.spin_images)

    def test_admin_api_shows_the_spin_read_only(self) -> None:
        self._result(self._post_batch([_spin_item("FUR-000136")]))
        product = Product.objects.get(sku="FUR-000136")
        url = reverse("products_admin:admin-product-detail", args=[product.pk])

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["spin_images"], product.spin_images)
