"""Unit tests for legacy /api/ → /api/v1/ path rewriting."""

from django.test import SimpleTestCase

from config.legacy_api import rewrite_legacy_api_path


class RewriteLegacyApiPathTests(SimpleTestCase):
    def test_rewrites_unversioned_api_paths(self) -> None:
        self.assertEqual(
            rewrite_legacy_api_path("/api/healthz/"),
            "/api/v1/healthz/",
        )
        self.assertEqual(
            rewrite_legacy_api_path("/api/auth/login/"),
            "/api/v1/auth/login/",
        )

    def test_leaves_v1_and_non_api_unchanged(self) -> None:
        self.assertIsNone(rewrite_legacy_api_path("/api/v1/healthz/"))
        self.assertIsNone(rewrite_legacy_api_path("/api/v1/auth/login/"))
        self.assertIsNone(rewrite_legacy_api_path("/admin/"))
        self.assertIsNone(rewrite_legacy_api_path("/media/x"))

    def test_rewrites_api_root_edge(self) -> None:
        self.assertEqual(rewrite_legacy_api_path("/api/"), "/api/v1/")
        self.assertEqual(rewrite_legacy_api_path("/api"), "/api/v1")
