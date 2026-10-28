"""Unit tests for Phase I3 batch ingest fixture smoke."""

from __future__ import annotations

import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import Role, User
from config.batch_ingest_smoke import (
    INTAKE_COLUMNS,
    REPORT_COLUMNS,
    load_scenario_items,
    run_batch_ingest_smoke,
)
from products.models import Product


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    MEDIA_ROOT=tempfile.mkdtemp(),
)
class BatchIngestSmokeTests(TestCase):
    def setUp(self) -> None:
        admin_role = Role.objects.get(role_name="Administrator")
        self.admin = User.objects.create_user(
            email="i3-batch-smoke-admin@example.com",
            full_name="I3 Batch Smoke Admin",
            password="StrongPass123!",
            role=admin_role,
            email_verified=True,
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff", "updated_at"])

    def test_fixture_headers_match_locked_contract(self) -> None:
        result = run_batch_ingest_smoke(apply=False)
        by_name = {c.name: c for c in result.checks}
        self.assertTrue(by_name["fixtures_present"].ok)
        for scenario in ("happy", "mismatch", "gate-failures"):
            self.assertTrue(
                by_name[f"headers_report_{scenario}"].ok,
                msg=by_name[f"headers_report_{scenario}"].detail,
            )
            self.assertTrue(
                by_name[f"headers_intake_{scenario}"].ok,
                msg=by_name[f"headers_intake_{scenario}"].detail,
            )
        self.assertEqual(len(REPORT_COLUMNS), 25)
        self.assertEqual(len(INTAKE_COLUMNS), 15)
        self.assertIn("Thumbnail Path", INTAKE_COLUMNS)
        self.assertIn("Gallery Image Paths", INTAKE_COLUMNS)
        self.assertIn("Tags", INTAKE_COLUMNS)

    def test_gate_dry_run_matches_fixture_expectations(self) -> None:
        result = run_batch_ingest_smoke(apply=False)
        by_name = {c.name: c for c in result.checks}
        self.assertTrue(by_name["gate_MDL-000142"].ok)
        self.assertIn("pass", by_name["gate_MDL-000142"].detail)
        self.assertTrue(by_name["gate_MDL-000199"].ok)
        self.assertIn("folder_mismatch", by_name["gate_MDL-000199"].detail)
        self.assertTrue(by_name["gate_MDL-000201"].ok)
        self.assertIn("exports_incomplete", by_name["gate_MDL-000201"].detail)
        self.assertTrue(by_name["gate_MDL-000202"].ok)
        self.assertIn("invalid_price", by_name["gate_MDL-000202"].detail)
        self.assertTrue(by_name["gate_MDL-000203"].ok)
        self.assertIn("missing_thumbnail", by_name["gate_MDL-000203"].detail)
        self.assertTrue(result.all_ok)

    def test_happy_items_built_from_csv_fixtures(self) -> None:
        items = load_scenario_items("happy")
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item["model_id"], "MDL-000142")
        self.assertEqual(item["price"], "29.99")
        self.assertEqual(item["media"]["thumbnail_key"], "models/MDL-000142/thumbnail.jpg")
        self.assertEqual(item["media"]["package_key"], "models/MDL-000142/package.zip")
        self.assertEqual(item["exports"]["glb"], "Success")
        self.assertEqual(item["exports"]["fbx"], "Success")

    def test_gate_failure_items_have_expected_media_gaps(self) -> None:
        by_id = {i["model_id"]: i for i in load_scenario_items("gate-failures")}
        self.assertEqual(by_id["MDL-000202"]["price"], None)
        self.assertEqual(by_id["MDL-000203"]["media"]["thumbnail_key"], "")
        self.assertEqual(by_id["MDL-000201"]["exports"]["fbx"], "Failed")

    def test_apply_publishes_happy_sku(self) -> None:
        result = run_batch_ingest_smoke(apply=True)
        self.assertTrue(result.all_ok, msg=[c for c in result.checks if not c.ok])
        self.assertTrue(result.applied)
        self.assertEqual(result.published_sku, "MDL-000142")
        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertEqual(product.import_batch_id, "i3-batch-ingest-smoke")
        self.assertEqual(result.warnings, ())

    def test_command_dry_run_ok(self) -> None:
        out = StringIO()
        call_command("check_batch_ingest", stdout=out)
        text = out.getvalue()
        self.assertIn("batch_ingest_smoke OK (dry-run)", text)
        self.assertIn("[OK] gate_MDL-000142", text)
        self.assertIn("[OK] gate_MDL-000203", text)
