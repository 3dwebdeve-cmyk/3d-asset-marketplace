from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings


class ReindexSearchCommandTests(SimpleTestCase):
    @override_settings(MEILI_URL="", MEILI_MASTER_KEY="")
    def test_requires_meili_url(self) -> None:
        with self.assertRaises(CommandError):
            call_command("reindex_search")

    @override_settings(MEILI_URL="http://127.0.0.1:7700", MEILI_MASTER_KEY="k")
    @patch("search.management.commands.reindex_search.reindex_all", return_value=(3, 2))
    def test_reports_counts(self, _reindex) -> None:
        out = StringIO()
        call_command("reindex_search", stdout=out)
        self.assertIn("Indexed 3 products and 2 plugins", out.getvalue())
