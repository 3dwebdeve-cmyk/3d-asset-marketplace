"""Plugin re-uploads: the administrator owns the text; a live plugin's update waits in review."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.api_keys import CatalogApiKeyService
from accounts.models import ActivityLog, Role, User
from plugins.models import Plugin, PluginCategory
from plugins.services import PluginError, PluginService
from plugins.test_plugin_ingest import _item, _own_media_root, _put_objects

PASSWORD = "Reupload-Strong-Pass-2026!"
PLUGIN_ID = "PLG-ANI-000001"


class PluginReuploadTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        _own_media_root(self)
        self.category = PluginCategory.objects.create(
            name="Animation", slug="animation", code="ANI"
        )
        self.other_category = PluginCategory.objects.create(
            name="Rigging", slug="rigging", code="RIG"
        )
        self.admin = User.objects.create_user(
            email="plugin-reupload-admin@example.com",
            full_name="Plugin Reupload Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.issued = CatalogApiKeyService.create_key(name="plugin-pc", scope="plugins")
        _put_objects(PLUGIN_ID)
        self._import([_item(manifest={"name": "Rig Helper", "version": "1.0"})], batch="exe-1")
        self.plugin = Plugin.objects.get(plugin_id=PLUGIN_ID)

    # ─── helpers ──────────────────────────────────────────────────────────

    def _import(self, items: list[dict], batch: str):
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {self.issued.key}")
        return self.client.post(
            reverse("plugin_ingest:import"),
            {"import_batch_id": batch, "import_source": "plugin-uploader", "items": items},
            format="json",
        )

    def _login_as_admin(self) -> None:
        from accounts.services import AuthenticationService

        access = AuthenticationService.build_tokens(self.admin, mfa=True)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _publish(self, price: str = "19.00") -> None:
        Plugin.objects.filter(pk=self.plugin.pk).update(
            status=Plugin.Status.PUBLISHED, price=Decimal(price)
        )
        self.plugin.refresh_from_db()

    def _reupload(self, batch: str = "exe-2", **overrides):
        manifest = overrides.pop("manifest", {"name": "Rig Helper", "version": "2.0"})
        response = self._import([_item(manifest=manifest, **overrides)], batch=batch)
        self.plugin.refresh_from_db()
        return response.data["results"][0]

    # ─── the administrator owns the text ─────────────────────────────────

    def test_reupload_keeps_name_description_and_category_set_in_console(self) -> None:
        Plugin.objects.filter(pk=self.plugin.pk).update(
            name="Rig Helper Pro",
            description="Written by the admin.",
            category=self.other_category,
        )

        row = self._reupload(description="Sheet text")

        self.assertEqual(row["action"], "updated", row)
        self.assertIn("console_text_kept", row["warnings"])
        self.assertEqual(self.plugin.name, "Rig Helper Pro")
        self.assertEqual(self.plugin.description, "Written by the admin.")
        self.assertEqual(self.plugin.category, self.other_category)
        self.assertEqual(self.plugin.manifest["version"], "2.0")
        self.assertEqual(self.plugin.version, "2.0")
        self.assertEqual(self.plugin.import_batch_id, "exe-2")

    def test_same_text_reports_no_warning(self) -> None:
        row = self._reupload()
        self.assertNotIn("warnings", row)

    def test_a_rename_in_console_does_not_block_the_next_upload(self) -> None:
        # The sheet still has the name the plugin was first uploaded under (in the manifest).
        Plugin.objects.filter(pk=self.plugin.pk).update(name="Renamed In Console")

        row = self._reupload()

        self.assertEqual(row["action"], "updated", row)
        self.assertEqual(self.plugin.name, "Renamed In Console")

    def test_a_different_plugin_with_the_same_id_is_still_refused(self) -> None:
        row = self._reupload(name="Something Else", manifest={"name": "Something Else"})
        self.assertEqual(row["reason"], "plugin_id_in_use")

    def test_a_switched_off_category_does_not_block_a_reupload(self) -> None:
        PluginCategory.objects.filter(pk=self.category.pk).update(is_active=False)

        row = self._reupload()

        self.assertEqual(row["action"], "updated", row)

    def test_a_new_plugin_still_needs_an_active_category(self) -> None:
        PluginCategory.objects.filter(pk=self.category.pk).update(is_active=False)
        _put_objects("PLG-ANI-000002")

        response = self._import([_item("PLG-ANI-000002", name="Other")], batch="exe-2")

        self.assertEqual(response.data["results"][0]["reason"], "unknown_category")

    def test_the_package_row_keeps_its_id(self) -> None:
        file_id = self.plugin.files.get().pk

        self._reupload(media={**_item()["media"], "package_file_size": 99})

        file = self.plugin.files.get()
        self.assertEqual(file.pk, file_id)
        self.assertEqual(file.file_size, 99)
        self.assertEqual(file.version, "2.0")

    def test_archived_and_draft_plugins_go_back_to_review(self) -> None:
        for previous in (Plugin.Status.ARCHIVED, Plugin.Status.DRAFT):
            Plugin.objects.filter(pk=self.plugin.pk).update(status=previous)
            row = self._reupload(batch=f"exe-{previous}")
            self.assertEqual(row["status"], "pending_review", previous)
            self.assertFalse(self.plugin.pending_update)

    # ─── a live plugin's update ──────────────────────────────────────────

    def test_live_plugin_stays_on_sale_with_its_price(self) -> None:
        self._publish("19.00")

        row = self._reupload()

        self.assertEqual(row["status"], "published")
        self.assertEqual(row["warnings"], ["live_update_in_qa"])
        self.assertEqual(self.plugin.status, Plugin.Status.PUBLISHED)
        self.assertTrue(self.plugin.pending_update)
        self.assertEqual(self.plugin.price, Decimal("19.00"))
        # Still on the storefront.
        self.client.credentials()
        public = self.client.get(reverse("plugins:plugin-detail", args=[self.plugin.slug]))
        self.assertEqual(public.status_code, status.HTTP_200_OK)

    def test_live_update_is_in_the_review_queue(self) -> None:
        self._publish()
        self._reupload()
        self._login_as_admin()

        response = self.client.get(reverse("plugins_admin:admin-plugins"), {"status": "pending_review"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {row["id"]: row for row in response.data["results"]}
        self.assertIn(str(self.plugin.pk), rows)
        self.assertTrue(rows[str(self.plugin.pk)]["pending_update"])
        published = self.client.get(reverse("plugins_admin:admin-plugins"), {"status": "published"})
        self.assertIn(str(self.plugin.pk), {row["id"] for row in published.data["results"]})

    def test_approving_a_live_update_keeps_the_price_and_clears_the_flag(self) -> None:
        self._publish("19.00")
        self._reupload()
        self._login_as_admin()

        with patch("plugins.services.private_object_exists", return_value=True):
            response = self.client.post(
                reverse("plugins_admin:admin-plugin-approve", args=[self.plugin.pk]),
                {},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.PUBLISHED)
        self.assertFalse(self.plugin.pending_update)
        self.assertEqual(self.plugin.price, Decimal("19.00"))
        self.assertEqual(self.plugin.reviewed_by, self.admin)
        log = ActivityLog.objects.filter(action="plugin_approve").latest("created_at")
        self.assertTrue(log.metadata["live_update"])

    def test_a_new_plugin_cannot_be_approved_without_a_price(self) -> None:
        with self.assertRaises(PluginError) as caught:
            PluginService.approve_plugin(self.plugin, reviewer=self.admin)
        self.assertEqual(caught.exception.field, "price")

    def test_rejecting_a_live_update_takes_the_plugin_off_the_store(self) -> None:
        self._publish()
        self._reupload()
        self._login_as_admin()

        response = self.client.post(
            reverse("plugins_admin:admin-plugin-reject", args=[self.plugin.pk]),
            {"reason": "The new package is broken."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.status, Plugin.Status.REJECTED)
        self.assertFalse(self.plugin.pending_update)
        self.client.credentials()
        public = self.client.get(reverse("plugins:plugin-detail", args=[self.plugin.slug]))
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_published_plugin_without_an_update_cannot_be_approved_or_rejected(self) -> None:
        self._publish()
        with self.assertRaises(PluginError):
            PluginService.approve_plugin(self.plugin, reviewer=self.admin)
        with self.assertRaises(PluginError):
            PluginService.reject_plugin(self.plugin, reviewer=self.admin, reason="No")

    # ─── a refused live re-upload ────────────────────────────────────────

    def test_a_refused_live_reupload_is_flagged_for_review(self) -> None:
        self._publish()

        row = self._reupload(media={**_item()["media"], "package_key": "plugins/x.zip"})

        self.assertEqual(row["action"], "skipped")
        self.assertEqual(row["reason"], "invalid_object_key")
        self.assertEqual(row["warnings"], ["live_update_in_qa"])
        self.assertTrue(self.plugin.pending_update)
        self.assertEqual(self.plugin.status, Plugin.Status.PUBLISHED)
        self.assertIn("Re-upload exe-2 was refused (invalid_object_key)", self.plugin.qa_notes)

    def test_a_later_good_upload_clears_the_refusal_note(self) -> None:
        self._publish()
        Plugin.objects.filter(pk=self.plugin.pk).update(qa_notes="Checked on Max 2026.")
        self._reupload(media={**_item()["media"], "package_key": "plugins/x.zip"})

        self._reupload(batch="exe-3")

        self.assertEqual(self.plugin.qa_notes, "Checked on Max 2026.")
        self.assertTrue(self.plugin.pending_update)

    def test_a_refused_upload_of_a_plugin_in_review_is_not_flagged(self) -> None:
        row = self._reupload(media={**_item()["media"], "package_key": "plugins/x.zip"})

        self.assertNotIn("warnings", row)
        self.assertFalse(self.plugin.pending_update)
        self.assertEqual(self.plugin.qa_notes, "")
