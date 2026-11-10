"""Uploader core: sheet reading, file checks, IDs, keys, upload and import. No network, no R2."""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from plugin_uploader.core import (
    Category,
    UploaderError,
    describe_outcome,
    find_assets,
    make_plugin_id,
    manifest_key,
    package_key,
    plan_batch,
    read_rows,
    run_batch,
    thumbnail_key,
)

CATEGORIES = [Category(code="ANI", name="Animation"), Category(code="RIG", name="Rigging")]
SHEET = [
    ("Name", "Category", "Description"),
    ("Rig Helper", "Animation", "Helps with rigs."),
    ("Bone Tool", "RIG", "Bones, quickly."),
]


class FakeStorage:
    def __init__(self) -> None:
        self.private: dict[str, bytes] = {}
        self.public: dict[str, bytes] = {}

    def put_private(self, key: str, data: bytes, content_type: str) -> None:
        self.private[key] = data

    def put_public(self, key: str, data: bytes, content_type: str) -> None:
        self.public[key] = data


class FakeApi:
    def __init__(
        self, next_sequence: int = 1, refuse: set[str] | None = None, live: set[str] | None = None
    ) -> None:
        self.next_sequence = next_sequence
        self.refuse = refuse or set()
        self.live = live or set()
        self.batches: list[dict] = []

    def next_ids(self) -> dict:
        return {"next_sequence": self.next_sequence, "categories": []}

    def import_batch(self, payload: dict) -> dict:
        self.batches.append(payload)
        results = []
        for item in payload["items"]:
            if item["plugin_id"] in self.refuse:
                results.append({"plugin_id": item["plugin_id"], "action": "skipped", "reason": "plugin_id_in_use"})
            elif item["plugin_id"] in self.live:
                results.append(
                    {
                        "plugin_id": item["plugin_id"],
                        "action": "updated",
                        "status": "published",
                        "warnings": ["console_text_kept", "live_update_in_qa"],
                    }
                )
            else:
                results.append({"plugin_id": item["plugin_id"], "action": "created", "status": "pending_review"})
        return {"results": results}


def make_plugin_folder(root: Path, name: str, *, zips: int = 1, images: int = 1) -> None:
    folder = root / name
    folder.mkdir(parents=True)
    for index in range(zips):
        (folder / f"{name.replace(' ', '')}{index}.zip").write_bytes(b"PK\x05\x06" + b"\x00" * 18)
    for index in range(images):
        (folder / f"thumb{index}.webp").write_bytes(b"RIFF....WEBP")


class SheetTests(unittest.TestCase):
    def test_reads_rows_and_skips_blank_lines(self) -> None:
        rows = read_rows(SHEET + [(None, None, None)])
        self.assertEqual([row.name for row in rows], ["Rig Helper", "Bone Tool"])
        self.assertEqual(rows[0].row_number, 2)
        self.assertEqual(rows[0].version, "1.0")

    def test_missing_column_is_reported(self) -> None:
        with self.assertRaisesRegex(UploaderError, "Description"):
            read_rows([("Name", "Category"), ("A plugin", "ANI")])

    def test_empty_sheet_is_refused(self) -> None:
        with self.assertRaises(UploaderError):
            read_rows([])

    def test_category_matches_name_or_code_ignoring_case(self) -> None:
        rows = read_rows([("Name", "Category", "Description"), ("Rig Helper", "animation", "x"), ("Bone", "rig", "y")])
        self.assertEqual(rows[0].category, "animation")
        from plugin_uploader.core import find_category

        self.assertEqual(find_category(CATEGORIES, "animation").code, "ANI")
        self.assertEqual(find_category(CATEGORIES, "RIG").name, "Rigging")
        self.assertIsNone(find_category(CATEGORIES, "Nope"))


class IdTests(unittest.TestCase):
    def test_ids_have_the_expected_shape(self) -> None:
        self.assertEqual(make_plugin_id("ANI", 1), "PLG-ANI-000001")
        self.assertEqual(make_plugin_id("RIG", 123456), "PLG-RIG-123456")

    def test_bad_category_code_is_refused(self) -> None:
        with self.assertRaises(UploaderError):
            make_plugin_id("an", 1)

    def test_id_limit_is_enforced(self) -> None:
        with self.assertRaises(UploaderError):
            make_plugin_id("ANI", 1_000_000)

    def test_keys_follow_the_server_layout(self) -> None:
        self.assertEqual(package_key("PLG-ANI-000001"), "plugins/PLG-ANI-000001/PLG-ANI-000001.zip")
        self.assertEqual(thumbnail_key("PLG-ANI-000001", ".WEBP"), "plugins/PLG-ANI-000001/thumbnail.webp")
        self.assertEqual(manifest_key("PLG-ANI-000001"), "plugins/PLG-ANI-000001/plugin.json")


class FileTests(unittest.TestCase):
    def test_one_zip_and_one_image_is_required(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin_folder(root, "Good One")
            make_plugin_folder(root, "Two Zips", zips=2)
            make_plugin_folder(root, "No Image", images=0)
            self.assertEqual(find_assets(root / "Good One")[0].suffix, ".zip")
            with self.assertRaisesRegex(UploaderError, "exactly one .zip"):
                find_assets(root / "Two Zips")
            with self.assertRaisesRegex(UploaderError, "exactly one image"):
                find_assets(root / "No Image")
            with self.assertRaisesRegex(UploaderError, "No folder"):
                find_assets(root / "Missing")


class PlanTests(unittest.TestCase):
    def test_new_rows_count_up_and_bad_rows_are_skipped_with_a_reason(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin_folder(root, "Rig Helper")
            rows = read_rows(SHEET)  # Bone Tool has no folder
            plans, report = plan_batch(rows, categories=CATEGORIES, plugin_root=root, next_sequence=7)
            self.assertEqual([p.plugin_id for p in plans], ["PLG-ANI-000007"])
            by_name = {r.name: r for r in report.rows}
            self.assertEqual(by_name["Rig Helper"].status, "ready")
            self.assertEqual(by_name["Bone Tool"].status, "skipped")
            self.assertIn("No folder", by_name["Bone Tool"].message)

    def test_existing_plugin_id_is_kept_and_must_match_the_category(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin_folder(root, "Rig Helper")
            rows = read_rows([("Name", "Category", "Description", "Plugin ID"), ("Rig Helper", "Animation", "x", "PLG-ANI-000042")])
            plans, _ = plan_batch(rows, categories=CATEGORIES, plugin_root=root, next_sequence=1)
            self.assertEqual(plans[0].plugin_id, "PLG-ANI-000042")

            wrong = read_rows([("Name", "Category", "Description", "Plugin ID"), ("Rig Helper", "Animation", "x", "PLG-RIG-000042")])
            plans, report = plan_batch(wrong, categories=CATEGORIES, plugin_root=root, next_sequence=1)
            self.assertEqual(plans, [])
            self.assertIn("does not match", report.rows[0].message)

    def test_blank_name_and_description_are_refused(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            rows = read_rows([("Name", "Category", "Description"), ("X", "Animation", "ok"), ("Fine Name", "Animation", "")])
            plans, report = plan_batch(rows, categories=CATEGORIES, plugin_root=Path(tmp), next_sequence=1)
            self.assertEqual(plans, [])
            messages = [r.message for r in report.rows]
            self.assertTrue(any("at least 2" in m for m in messages))
            self.assertTrue(any("Description is required" in m for m in messages))


class RunTests(unittest.TestCase):
    def test_full_run_uploads_zip_private_thumbnail_public_and_imports_pending(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin_folder(root, "Rig Helper")
            storage, api = FakeStorage(), FakeApi(next_sequence=5)
            report, saved = run_batch(
                read_rows(SHEET),
                categories=CATEGORIES,
                plugin_root=root,
                api=api,
                storage=storage,
                batch_id="exe-test",
            )

            plugin_id = "PLG-ANI-000005"
            self.assertIn(package_key(plugin_id), storage.private)
            self.assertIn(thumbnail_key(plugin_id, ".webp"), storage.public)
            self.assertNotIn(package_key(plugin_id), storage.public)  # the zip never goes public
            manifest = json.loads(storage.private[manifest_key(plugin_id)])
            self.assertEqual(manifest["plugin_id"], plugin_id)
            self.assertEqual(len(manifest["package_sha256"]), 64)

            item = api.batches[0]["items"][0]
            self.assertEqual(item["plugin_id"], plugin_id)
            self.assertEqual(item["media"]["package_key"], package_key(plugin_id))
            self.assertEqual(saved, [(2, plugin_id)])
            self.assertEqual({r.status for r in report.rows}, {"imported", "skipped"})

    def test_server_refusal_is_reported_and_not_saved(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin_folder(root, "Rig Helper")
            api = FakeApi(next_sequence=1, refuse={"PLG-ANI-000001"})
            report, saved = run_batch(
                read_rows(SHEET), categories=CATEGORIES, plugin_root=root,
                api=api, storage=FakeStorage(), batch_id="exe-test",
            )
            row = next(r for r in report.rows if r.name == "Rig Helper")
            self.assertEqual(row.status, "skipped")
            self.assertIn("belongs to another plugin", row.message)
            self.assertEqual(saved, [])

    def test_a_live_plugin_update_is_reported_in_words(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin_folder(root, "Rig Helper")
            api = FakeApi(next_sequence=1, live={"PLG-ANI-000001"})
            report, saved = run_batch(
                read_rows(SHEET), categories=CATEGORIES, plugin_root=root,
                api=api, storage=FakeStorage(), batch_id="exe-test",
            )
            row = next(r for r in report.rows if r.name == "Rig Helper")
            self.assertEqual(row.status, "imported")
            self.assertIn("still on sale, update waiting for review", row.message)
            self.assertIn("kept the name and description set in /console", row.message)
            self.assertEqual(saved, [(2, "PLG-ANI-000001")])

    def test_an_unknown_code_is_shown_as_is(self) -> None:
        self.assertEqual(
            describe_outcome({"action": "skipped", "reason": "something_new"}), "something_new"
        )

    def test_a_failed_upload_does_not_stop_the_other_rows(self) -> None:
        class FlakyStorage(FakeStorage):
            def put_private(self, key, data, content_type):
                if "PLG-ANI-000001" in key and key.endswith(".zip"):
                    raise OSError("network down")
                super().put_private(key, data, content_type)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_plugin_folder(root, "Rig Helper")
            make_plugin_folder(root, "Bone Tool")
            sheet = [("Name", "Category", "Description"), ("Rig Helper", "Animation", "a"), ("Bone Tool", "Rigging", "b")]
            report, saved = run_batch(
                read_rows(sheet), categories=CATEGORIES, plugin_root=root,
                api=FakeApi(next_sequence=1), storage=FlakyStorage(), batch_id="exe-test",
            )
            statuses = {r.name: r.status for r in report.rows}
            self.assertEqual(statuses["Rig Helper"], "failed")
            self.assertEqual(statuses["Bone Tool"], "imported")
            self.assertEqual(saved, [(3, "PLG-RIG-000002")])


if __name__ == "__main__":
    unittest.main()
