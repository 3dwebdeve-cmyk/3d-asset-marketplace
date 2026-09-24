"""Search config + no-op sync tasks after Meilisearch removal."""

from __future__ import annotations

from io import StringIO
from uuid import uuid4

from django.core.management import call_command
from django.test import SimpleTestCase

from search.client import (
    get_client,
    is_configured,
    is_required,
    master_key_is_weak,
    probe_meilisearch,
)


class ClientStubTests(SimpleTestCase):
    def test_always_unconfigured(self) -> None:
        self.assertFalse(is_configured())
        self.assertFalse(is_required())
        self.assertIsNone(get_client())
        self.assertFalse(probe_meilisearch(object()))
        self.assertFalse(master_key_is_weak("anything"))


class CheckSearchConfigCommandTests(SimpleTestCase):
    def test_reports_postgres_backend(self) -> None:
        out = StringIO()
        call_command("check_search_config", fail_on_warnings=True, stdout=out)
        text = out.getvalue()
        self.assertIn("search_backend=postgres_icontains", text)
        self.assertIn("Catalog search config looks ready", text)


class SearchSyncTaskTests(SimpleTestCase):
    def test_tasks_and_enqueue_are_noops(self) -> None:
        from search.tasks import (
            enqueue_sync_plugin,
            enqueue_sync_product,
            sync_plugin_task,
            sync_product_task,
        )

        product_id = uuid4()
        plugin_id = uuid4()
        sync_product_task.run(str(product_id))
        sync_plugin_task.run(str(plugin_id))
        enqueue_sync_product(product_id)
        enqueue_sync_plugin(plugin_id)
