"""Plugin uploader exe: /api/v1/catalog-ingest/plugins/ with an API key."""

from __future__ import annotations

import tempfile

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.api_keys import CatalogApiKeyError, CatalogApiKeyService
from accounts.models import ActivityLog
from plugins.models import Plugin, PluginCategory
from products.testing import make_image_bytes


def _own_media_root(test: APITestCase) -> None:
    """A fresh storage folder per test, so one test's files never leak into the next."""
    folder = tempfile.TemporaryDirectory()
    test.addCleanup(folder.cleanup)
    override = override_settings(MEDIA_ROOT=folder.name)
    override.enable()
    test.addCleanup(override.disable)


def _put_objects(plugin_id: str, *, thumbnail: bool = True, package: bool = True) -> None:
    if thumbnail:
        default_storage.save(
            f"plugins/{plugin_id}/thumbnail.webp", ContentFile(make_image_bytes(".webp"))
        )
    if package:
        default_storage.save(
            f"plugins/{plugin_id}/{plugin_id}.zip", ContentFile(b"PK\x05\x06" + b"\x00" * 18)
        )


def _item(plugin_id: str = "PLG-ANI-000001", name: str = "Rig Helper", **overrides) -> dict:
    item = {
        "plugin_id": plugin_id,
        "name": name,
        "category_code": plugin_id.split("-")[1],
        "description": "Helps with rigs.",
        "manifest": {"version": "2.1", "host": "any"},
        "media": {
            "thumbnail_key": f"plugins/{plugin_id}/thumbnail.webp",
            "package_key": f"plugins/{plugin_id}/{plugin_id}.zip",
            "package_file_size": 22,
        },
    }
    item.update(overrides)
    return item


class PluginIngestAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        _own_media_root(self)
        self.category = PluginCategory.objects.create(
            name="Animation", slug="animation", code="ANI"
        )
        self.issued = CatalogApiKeyService.create_key(name="plugin-pc", scope="plugins")
        self.import_url = reverse("plugin_ingest:import")
        self.next_ids_url = reverse("plugin_ingest:next-ids")
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {self.issued.key}")

    def _post(self, items: list[dict], batch: str = "exe-1"):
        return self.client.post(
            self.import_url,
            {"import_batch_id": batch, "import_source": "plugin-uploader", "items": items},
            format="json",
        )

    def test_import_creates_a_pending_plugin_with_no_price(self) -> None:
        _put_objects("PLG-ANI-000001")

        response = self._post([_item()])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["results"][0]["status"], "pending_review")
        plugin = Plugin.objects.get(plugin_id="PLG-ANI-000001")
        self.assertEqual(plugin.status, Plugin.Status.PENDING_REVIEW)
        self.assertEqual(plugin.price, 0)
        self.assertEqual(plugin.category, self.category)
        self.assertEqual(plugin.import_batch_id, "exe-1")
        self.assertEqual(plugin.manifest["version"], "2.1")
        self.assertIn("/plugins/PLG-ANI-000001/thumbnail.webp", plugin.thumbnail)
        file = plugin.files.get()
        self.assertTrue(file.is_primary)
        self.assertEqual(file.storage_path, "plugins/PLG-ANI-000001/PLG-ANI-000001.zip")
        self.assertTrue(ActivityLog.objects.filter(action="plugin_ingest_import").exists())

    def test_reimport_updates_and_requeues_a_rejected_plugin(self) -> None:
        _put_objects("PLG-ANI-000001")
        self._post([_item()])
        Plugin.objects.filter(plugin_id="PLG-ANI-000001").update(
            status=Plugin.Status.REJECTED, reject_reason="Blurry thumbnail"
        )

        response = self._post([_item(description="Better description.")], batch="exe-2")

        self.assertEqual(response.data["updated"], 1, response.data)
        plugin = Plugin.objects.get(plugin_id="PLG-ANI-000001")
        self.assertEqual(plugin.status, Plugin.Status.PENDING_REVIEW)
        self.assertEqual(plugin.description, "Better description.")
        self.assertEqual(plugin.files.count(), 1)

    def test_published_plugin_is_never_rewritten(self) -> None:
        _put_objects("PLG-ANI-000001")
        self._post([_item()])
        Plugin.objects.filter(plugin_id="PLG-ANI-000001").update(status=Plugin.Status.PUBLISHED)

        response = self._post([_item(description="Changed")], batch="exe-2")

        self.assertEqual(response.data["results"][0]["reason"], "already_reviewed")
        self.assertEqual(
            Plugin.objects.get(plugin_id="PLG-ANI-000001").description, "Helps with rigs."
        )

    def test_same_id_for_a_different_plugin_is_refused(self) -> None:
        _put_objects("PLG-ANI-000001")
        self._post([_item()])

        response = self._post([_item(name="Totally Different")], batch="exe-2")

        self.assertEqual(response.data["results"][0]["reason"], "plugin_id_in_use")
        self.assertEqual(Plugin.objects.get(plugin_id="PLG-ANI-000001").name, "Rig Helper")

    def test_bad_rows_are_skipped_with_a_reason(self) -> None:
        _put_objects("PLG-ANI-000001", thumbnail=False)
        _put_objects("PLG-ANI-000002", package=False)
        _put_objects("PLG-RIG-000003")
        _put_objects("PLG-ANI-000005")
        PluginCategory.objects.create(name="Rigging", slug="rigging", code="RIG", is_active=False)
        rows = {
            "PLG-ANI-000001": ("missing_thumbnail_object", _item("PLG-ANI-000001")),
            "PLG-ANI-000002": ("missing_package_object", _item("PLG-ANI-000002")),
            "PLG-RIG-000003": ("unknown_category", _item("PLG-RIG-000003")),
            "PLG-XXX-000004": ("unknown_category", _item("PLG-XXX-000004")),
            "PLG-ANI-000005": (
                "category_mismatch",
                _item("PLG-ANI-000005", category_code="RIG"),
            ),
            "plg-bad": ("invalid_plugin_id", _item("plg-bad", category_code="ANI")),
        }

        response = self._post([row for _reason, row in rows.values()])

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        reasons = {row["plugin_id"]: row.get("reason") for row in response.data["results"]}
        for plugin_id, (reason, _row) in rows.items():
            self.assertEqual(reasons[plugin_id], reason, plugin_id)
        self.assertEqual(Plugin.objects.count(), 0)

    def test_keys_outside_the_plugin_folder_are_refused(self) -> None:
        _put_objects("PLG-ANI-000001")
        item = _item()
        item["media"]["package_key"] = "plugins/PLG-ANI-000009/PLG-ANI-000009.zip"
        other = _item("PLG-ANI-000002")
        other["media"]["thumbnail_key"] = "plugins/PLG-ANI-000002/../x.webp"

        response = self._post([item, other])

        self.assertEqual(
            [row["reason"] for row in response.data["results"]],
            ["invalid_object_key", "invalid_object_key"],
        )

    def test_a_fake_image_is_not_accepted_as_a_thumbnail(self) -> None:
        default_storage.save("plugins/PLG-ANI-000001/thumbnail.webp", ContentFile(b"not an image"))
        default_storage.save(
            "plugins/PLG-ANI-000001/PLG-ANI-000001.zip", ContentFile(b"PK\x05\x06")
        )

        response = self._post([_item()])

        self.assertEqual(response.data["results"][0]["reason"], "invalid_thumbnail")

    def test_next_ids_lists_codes_and_the_next_number(self) -> None:
        PluginCategory.objects.create(name="Hidden", slug="hidden", code="HID", is_active=False)
        PluginCategory.objects.create(name="No code", slug="no-code")
        _put_objects("PLG-ANI-000007")
        self._post([_item("PLG-ANI-000007")])

        response = self.client.get(self.next_ids_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["last_sequence"], 7)
        self.assertEqual(response.data["next_sequence"], 8)
        self.assertEqual(response.data["categories"], [{"code": "ANI", "name": "Animation"}])

    def test_next_ids_starts_at_one(self) -> None:
        response = self.client.get(self.next_ids_url)
        self.assertEqual(response.data["next_sequence"], 1)


class PluginIngestAuthTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        _own_media_root(self)
        self.import_url = reverse("plugin_ingest:import")
        self.next_ids_url = reverse("plugin_ingest:next-ids")

    def test_no_key_is_refused(self) -> None:
        self.assertEqual(
            self.client.get(self.next_ids_url).status_code, status.HTTP_401_UNAUTHORIZED
        )
        self.assertEqual(
            self.client.post(self.import_url, {}, format="json").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_a_model_key_cannot_use_plugin_routes(self) -> None:
        model_key = CatalogApiKeyService.create_key(name="models-pc")
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {model_key.key}")
        self.assertEqual(self.client.get(self.next_ids_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_a_plugin_key_cannot_use_the_model_route(self) -> None:
        plugin_key = CatalogApiKeyService.create_key(name="plugins-pc", scope="plugins")
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {plugin_key.key}")
        response = self.client.post(
            reverse("catalog_ingest:import"),
            {"import_batch_id": "x", "items": []},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_revoked_plugin_key_is_refused(self) -> None:
        issued = CatalogApiKeyService.create_key(name="plugins-pc", scope="plugins")
        CatalogApiKeyService.revoke(issued.api_key.key_prefix)
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {issued.key}")
        self.assertEqual(
            self.client.get(self.next_ids_url).status_code, status.HTTP_401_UNAUTHORIZED
        )

    def test_scope_must_be_valid(self) -> None:
        with self.assertRaises(CatalogApiKeyError):
            CatalogApiKeyService.create_key(name="x", scope="everything")
