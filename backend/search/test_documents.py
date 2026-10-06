from django.test import SimpleTestCase

from search.services import normalize_query


class NormalizeQueryTests(SimpleTestCase):
    def test_strips_and_truncates(self) -> None:
        self.assertIsNone(normalize_query(None))
        self.assertIsNone(normalize_query("   "))
        self.assertEqual(normalize_query("  oak  "), "oak")
        self.assertEqual(len(normalize_query("x" * 150) or ""), 100)
