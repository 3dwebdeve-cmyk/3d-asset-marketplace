"""Phase E — check_search_config, Celery Meili sync, client health helpers."""

from __future__ import annotations

from io import StringIO
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings

from search.client import master_key_is_weak, probe_meilisearch


class ProbeMeilisearchTests(SimpleTestCase):
    def test_prefers_is_healthy(self) -> None:
        client = MagicMock()
        client.is_healthy.return_value = True
        self.assertTrue(probe_meilisearch(client))
        client.health.assert_not_called()

    def test_falls_back_to_health_status(self) -> None:
        client = MagicMock(spec=["health"])
        client.health.return_value = {"status": "available"}
        self.assertTrue(probe_meilisearch(client))

    def test_unhealthy_health_payload(self) -> None:
        client = MagicMock(spec=["health"])
        client.health.return_value = {"status": "unavailable"}
        self.assertFalse(probe_meilisearch(client))


class MasterKeyWeakTests(SimpleTestCase):
    def test_example_and_short_keys_are_weak(self) -> None:
        self.assertTrue(master_key_is_weak(""))
        self.assertTrue(master_key_is_weak("short"))
        self.assertTrue(master_key_is_weak("dev_master_key_change_me"))
        self.assertFalse(master_key_is_weak("a-unique-staging-master-key"))


class CheckSearchConfigCommandTests(SimpleTestCase):
    @override_settings(MEILI_URL="", MEILI_MASTER_KEY="", MEILI_REQUIRED=False, DEBUG=True)
    def test_unconfigured_debug_is_ok(self) -> None:
        out = StringIO()
        call_command("check_search_config", fail_on_warnings=True, stdout=out)
        self.assertIn("Search config looks ready", out.getvalue())
        self.assertIn("MEILI_healthy=skipped", out.getvalue())

    @override_settings(MEILI_URL="", MEILI_MASTER_KEY="", MEILI_REQUIRED=True, DEBUG=False)
    def test_required_but_unconfigured_fails(self) -> None:
        with self.assertRaises(CommandError):
            call_command("check_search_config", fail_on_warnings=True)

    @override_settings(
        MEILI_URL="http://127.0.0.1:7700",
        MEILI_MASTER_KEY="a-unique-staging-master-key",
        MEILI_REQUIRED=True,
    )
    @patch("search.management.commands.check_search_config.get_client")
    @patch(
        "search.management.commands.check_search_config.probe_meilisearch",
        return_value=True,
    )
    def test_healthy_configured_is_ok(
        self,
        _probe: MagicMock,
        get_client: MagicMock,
    ) -> None:
        get_client.return_value = MagicMock()
        out = StringIO()
        call_command("check_search_config", fail_on_warnings=True, stdout=out)
        self.assertIn("MEILI_healthy=True", out.getvalue())
        self.assertIn("Search config looks ready", out.getvalue())
        self.assertIn("reindex_search", out.getvalue())

    @override_settings(
        MEILI_URL="http://127.0.0.1:7700",
        MEILI_MASTER_KEY="a-unique-staging-master-key",
        MEILI_REQUIRED=True,
    )
    @patch("search.management.commands.check_search_config.get_client")
    @patch(
        "search.management.commands.check_search_config.probe_meilisearch",
        return_value=False,
    )
    def test_unhealthy_fails_on_warnings(
        self,
        _probe: MagicMock,
        get_client: MagicMock,
    ) -> None:
        get_client.return_value = MagicMock()
        with self.assertRaises(CommandError):
            call_command("check_search_config", fail_on_warnings=True)


class SearchSyncTaskTests(SimpleTestCase):
    @patch("search.indexer.sync_product_by_id")
    def test_product_task_delegates_to_indexer(self, sync_mock: MagicMock) -> None:
        from search.tasks import sync_product_task

        product_id = uuid4()
        sync_product_task.run(str(product_id))
        sync_mock.assert_called_once_with(product_id)

    @patch("search.indexer.sync_plugin_by_id")
    def test_plugin_task_delegates_to_indexer(self, sync_mock: MagicMock) -> None:
        from search.tasks import sync_plugin_task

        plugin_id = uuid4()
        sync_plugin_task.run(str(plugin_id))
        sync_mock.assert_called_once_with(plugin_id)

    @patch("search.indexer.sync_product_by_id")
    def test_invalid_id_is_skipped(self, sync_mock: MagicMock) -> None:
        from search.tasks import sync_product_task

        sync_product_task.run("not-a-uuid")
        sync_mock.assert_not_called()

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch("search.tasks.sync_product_task.delay")
    def test_enqueue_product_uses_after_commit_helper(self, delay_mock: MagicMock) -> None:
        from search.tasks import enqueue_sync_product

        product_id = uuid4()
        enqueue_sync_product(product_id)
        delay_mock.assert_called_once_with(str(product_id))

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch("search.tasks.sync_plugin_task.delay")
    def test_enqueue_plugin_uses_after_commit_helper(self, delay_mock: MagicMock) -> None:
        from search.tasks import enqueue_sync_plugin

        plugin_id = uuid4()
        enqueue_sync_plugin(plugin_id)
        delay_mock.assert_called_once_with(str(plugin_id))
