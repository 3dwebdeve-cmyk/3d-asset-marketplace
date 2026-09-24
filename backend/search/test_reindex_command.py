from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase


class ReindexSearchCommandTests(SimpleTestCase):
    def test_noop_succeeds(self) -> None:
        out = StringIO()
        call_command("reindex_search", stdout=out)
        self.assertIn("no-op", out.getvalue().lower())
