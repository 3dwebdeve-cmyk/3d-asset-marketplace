"""The Plugin Uploader exe on the models route: POST /api/v1/catalog-ingest/import/ with
``"product_type": "plugin"`` (plugins/ingest_adapter.py), free plugins and their downloads."""

from __future__ import annotations

from decimal import Decimal

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.api_keys import CatalogApiKeyService
from accounts.models import ActivityLog, Role, User
from plugins.models import Plugin, PluginCategory
from plugins.services import PluginError, PluginService, PluginUpdateData
from plugins.test_plugin_ingest import _own_media_root
from products.testing import make_image_bytes

ZIP_BYTES = b"PK\x05\x06" + b"\x00" * 18


def put_plugin_objects(root: str, plugin_id: str) -> None:
    """The two files the uploader puts under <root>/<ID>/: the thumbnail and the zip."""
    default_storage.save(
        f"{root}/{plugin_id}/plug_thumb_{plugin_id}.png", ContentFile(make_image_bytes(".png"))
    )
    default_storage.save(f"{root}/{plugin_id}/{plugin_id}.zip", ContentFile(ZIP_BYTES))


def exe_item(
    plugin_id: str = "PLUG-MAX-000001", *, free: bool = False, root: str | None = None, **overrides
) -> dict:
    """The item the Plugin Uploader sends (core/plugins.py), paid or ticked Free."""
    root = root or ("free-plugins" if free else "plugins")
    item = {
        "product_type": "plugin",
        "model_id": plugin_id,
        "name": "Scatter Tool",
        "category": "Max",
        "subcategory": "",
        "description": "Scatters objects.",
        "price": "0.00",
        "currency": "USD",
        "license_type": "standard",
        "package_formats": ["zip"],
        "package_sha256": "0" * 64,
        "folder_match_status": "Matched",
        "qa_status": "Ready for QA",
        "r2_key_prefix": f"{root}/{plugin_id}/",
        "is_free": free,
        "media": {
            "thumbnail_key": f"{root}/{plugin_id}/plug_thumb_{plugin_id}.png",
            "package_key": f"{root}/{plugin_id}/{plugin_id}.zip",
            "package_file_name": f"{plugin_id}.zip",
            "package_file_format": "zip",
            "package_file_size": 22,
            "gallery_keys": [],
        },
    }
    item.update(overrides)
    return item


class _ModelsRouteTestCase(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        _own_media_root(self)
        self.category = PluginCategory.objects.create(name="Max", slug="max", code="MAX")
        # The uploader keeps the models key it has (decision C).
        issued = CatalogApiKeyService.create_key(name="plugin-pc")
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {issued.key}")
        self.url = reverse("catalog_ingest:import")

    def _post(self, items: list[dict], batch: str = "plug-1"):
        return self.client.post(
            self.url,
            {"import_batch_id": batch, "import_source": "plugin-uploader", "items": items},
            format="json",
        )

    def _rows(self, response) -> dict[str, tuple[str, str]]:
        return {
            row["model_id"]: (row["action"], row.get("reason", ""))
            for row in response.data["results"]
        }


class PluginItemsOnTheModelsRouteTests(_ModelsRouteTestCase):
    def test_plugin_item_is_created_pending_with_no_price_and_answers_with_model_id(self) -> None:
        put_plugin_objects("plugins", "PLUG-MAX-000001")

        response = self._post([exe_item()])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["created"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["model_id"], "PLUG-MAX-000001")
        self.assertEqual(row["plugin_id"], "PLUG-MAX-000001")
        self.assertEqual(row["action"], "created")
        self.assertEqual(row["status"], "pending_review")
        plugin = Plugin.objects.get(plugin_id="PLUG-MAX-000001")
        self.assertEqual(plugin.status, Plugin.Status.PENDING_REVIEW)
        self.assertEqual(plugin.price, 0)
        self.assertFalse(plugin.is_free)
        self.assertEqual(plugin.category, self.category)
        self.assertEqual(
            plugin.files.get().storage_path, "plugins/PLUG-MAX-000001/PLUG-MAX-000001.zip"
        )
        log = ActivityLog.objects.get(action="catalog_ingest_import")
        self.assertEqual(log.metadata["created"], 1)

    def test_both_id_prefixes_are_accepted_and_others_refused(self) -> None:
        for plugin_id in ("PLG-MAX-000002", "PLUG-MAX-000003"):
            put_plugin_objects("plugins", plugin_id)

        response = self._post(
            [
                exe_item("PLG-MAX-000002", name="Old Style"),
                exe_item("PLUG-MAX-000003", name="New Style"),
                exe_item("PLUGX-MAX-000004", name="Wrong Prefix"),
            ]
        )

        self.assertEqual(
            self._rows(response),
            {
                "PLG-MAX-000002": ("created", ""),
                "PLUG-MAX-000003": ("created", ""),
                "PLUGX-MAX-000004": ("skipped", "invalid_plugin_id"),
            },
        )
        self.assertEqual((response.data["created"], response.data["skipped"]), (2, 1))

    def test_unknown_category_is_skipped_and_shown_in_the_imports_panel(self) -> None:
        put_plugin_objects("plugins", "PLUG-BLN-000001")

        response = self._post([exe_item("PLUG-BLN-000001")])

        self.assertEqual(self._rows(response), {"PLUG-BLN-000001": ("skipped", "unknown_category")})
        self.assertFalse(Plugin.objects.exists())
        log = ActivityLog.objects.get(action="catalog_ingest_import")
        self.assertEqual(log.metadata["skipped"], 1)
        self.assertEqual(log.metadata["skipped_reasons"], {"PLUG-BLN-000001": "unknown_category"})
        self.assertEqual(log.metadata["refused_names"], {"PLUG-BLN-000001": "Scatter Tool"})

    def test_category_code_that_does_not_match_the_id_is_skipped(self) -> None:
        PluginCategory.objects.create(name="Blender", slug="blender", code="BLN")
        put_plugin_objects("plugins", "PLUG-MAX-000001")

        response = self._post([exe_item(category_code="BLN")])

        self.assertEqual(self._rows(response), {"PLUG-MAX-000001": ("skipped", "category_mismatch")})

    def test_a_row_the_plugin_check_refuses_is_skipped_not_the_batch(self) -> None:
        put_plugin_objects("plugins", "PLUG-MAX-000002")

        response = self._post(
            [exe_item("PLUG-MAX-000001", description=""), exe_item("PLUG-MAX-000002")]
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            self._rows(response),
            {
                "PLUG-MAX-000001": ("skipped", "missing_description"),
                "PLUG-MAX-000002": ("created", ""),
            },
        )


class FreePluginImportTests(_ModelsRouteTestCase):
    def test_free_plugin_under_free_plugins_is_accepted_with_price_0(self) -> None:
        put_plugin_objects("free-plugins", "PLUG-MAX-000001")

        response = self._post([exe_item(free=True)])

        self.assertEqual(self._rows(response), {"PLUG-MAX-000001": ("created", "")})
        plugin = Plugin.objects.get(plugin_id="PLUG-MAX-000001")
        self.assertTrue(plugin.is_free)
        self.assertEqual(plugin.price, 0)
        self.assertIn("/free-plugins/PLUG-MAX-000001/", plugin.thumbnail)
        self.assertEqual(
            plugin.files.get().storage_path,
            "free-plugins/PLUG-MAX-000001/PLUG-MAX-000001.zip",
        )

    def test_files_must_be_in_the_folder_that_matches_free_or_paid(self) -> None:
        put_plugin_objects("free-plugins", "PLUG-MAX-000001")
        put_plugin_objects("plugins", "PLUG-MAX-000002")

        response = self._post(
            [
                exe_item("PLUG-MAX-000001", root="free-plugins", name="Paid In Free Folder"),
                exe_item("PLUG-MAX-000002", free=True, root="plugins", name="Free In Paid Folder"),
            ]
        )

        self.assertEqual(
            self._rows(response),
            {
                "PLUG-MAX-000001": ("skipped", "invalid_object_key"),
                "PLUG-MAX-000002": ("skipped", "invalid_object_key"),
            },
        )
        self.assertFalse(Plugin.objects.exists())

    def test_live_plugin_cannot_switch_between_free_and_paid(self) -> None:
        put_plugin_objects("plugins", "PLUG-MAX-000001")
        self._post([exe_item()])
        Plugin.objects.filter(plugin_id="PLUG-MAX-000001").update(
            status=Plugin.Status.PUBLISHED, price=Decimal("9.00")
        )
        put_plugin_objects("free-plugins", "PLUG-MAX-000001")

        response = self._post([exe_item(free=True)], batch="plug-2")

        self.assertEqual(self._rows(response), {"PLUG-MAX-000001": ("skipped", "live_free_change")})
        plugin = Plugin.objects.get(plugin_id="PLUG-MAX-000001")
        self.assertFalse(plugin.is_free)
        self.assertEqual(plugin.price, Decimal("9.00"))
        self.assertEqual(
            plugin.files.get().storage_path, "plugins/PLUG-MAX-000001/PLUG-MAX-000001.zip"
        )
        # Its files in R2 may already have changed, so it waits in QA.
        self.assertTrue(plugin.pending_update)


class FreePluginApprovalAndDownloadTests(_ModelsRouteTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.reviewer = User.objects.create_user(
            email="plugin-reviewer@example.com",
            full_name="Plugin Reviewer",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )

    def _imported(self, *, free: bool) -> Plugin:
        put_plugin_objects("free-plugins" if free else "plugins", "PLUG-MAX-000001")
        self._post([exe_item(free=free)])
        return Plugin.objects.get(plugin_id="PLUG-MAX-000001")

    def test_free_plugin_is_approved_and_kept_at_price_0(self) -> None:
        plugin = self._imported(free=True)

        with self.assertRaises(PluginError):
            PluginService.approve_plugin(plugin, reviewer=self.reviewer, price=Decimal("5.00"))
        approved = PluginService.approve_plugin(
            plugin, reviewer=self.reviewer, price=Decimal("0.00")
        )

        self.assertEqual(approved.status, Plugin.Status.PUBLISHED)
        with self.assertRaises(PluginError):
            PluginService.update_plugin(approved, PluginUpdateData(price=Decimal("3.00")))
        self.assertEqual(Plugin.objects.get(pk=plugin.pk).price, 0)

    def test_free_download_redirects_to_the_public_zip(self) -> None:
        plugin = self._imported(free=True)
        PluginService.approve_plugin(plugin, reviewer=self.reviewer, price=Decimal("0.00"))
        self.client.credentials()

        response = self.client.get(reverse("plugins:plugin-free-download", args=[plugin.slug]))

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertTrue(
            response["Location"].endswith("free-plugins/PLUG-MAX-000001/PLUG-MAX-000001.zip")
        )

    def test_a_paid_plugin_has_no_free_download(self) -> None:
        plugin = self._imported(free=False)
        PluginService.approve_plugin(plugin, reviewer=self.reviewer, price=Decimal("9.00"))
        self.client.credentials()

        response = self.client.get(reverse("plugins:plugin-free-download", args=[plugin.slug]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
