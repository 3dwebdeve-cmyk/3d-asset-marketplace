"""Smoke tests for Phase J / A5 backup helpers (no network, no Docker)."""

from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"


def _load_upload_module():
    path = SCRIPTS_DIR / "upload_backup_to_r2.py"
    spec = importlib.util.spec_from_file_location("upload_backup_to_r2", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BackupScriptsPresentTests(unittest.TestCase):
    def test_backup_script_documents_retention_and_drill(self) -> None:
        text = (SCRIPTS_DIR / "backup_postgres.sh").read_text(encoding="utf-8")
        self.assertIn("BACKUP_RETENTION_DAYS", text)
        self.assertIn("restore_postgres_drill.sh", text)
        self.assertIn("BACKUP_UPLOAD_R2", text)
        self.assertIn(r"$'\r'", text)

    def test_restore_drill_script_is_disposable_only(self) -> None:
        text = (SCRIPTS_DIR / "restore_postgres_drill.sh").read_text(encoding="utf-8")
        self.assertIn("marketplace-restore-drill-", text)
        self.assertIn("marketplace_restore_drill_", text)
        self.assertIn("RESTORE_DRILL_MODE", text)
        self.assertIn("postgres_data", text)
        self.assertIn("R2", text)
        self.assertNotIn("RESTORE_IN_PLACE", text)

    def test_install_backup_cron_script_documents_retention(self) -> None:
        path = SCRIPTS_DIR / "install_backup_cron.sh"
        self.assertTrue(path.is_file())
        text = path.read_text(encoding="utf-8")
        self.assertIn("BACKUP_RETENTION_DAYS", text)
        self.assertIn("BACKUP_UPLOAD_R2", text)
        self.assertIn("backups/postgres/", text)


class UploadBackupToR2Tests(unittest.TestCase):
    def test_missing_file_exits(self) -> None:
        mod = _load_upload_module()
        with patch.object(mod.sys, "argv", ["upload_backup_to_r2.py", "nope.dump"]):
            self.assertEqual(mod.main(), 1)

    def test_uploads_when_r2_env_present(self) -> None:
        mod = _load_upload_module()
        with tempfile.NamedTemporaryFile(suffix=".dump", delete=False) as handle:
            handle.write(b"pgdump")
            dump_path = handle.name
        self.addCleanup(Path(dump_path).unlink, missing_ok=True)

        fake_client = MagicMock()
        fake_boto3 = MagicMock()
        fake_boto3.client.return_value = fake_client
        env = {
            "R2_ACCESS_KEY_ID": "ak",
            "R2_SECRET_ACCESS_KEY": "sk",
            "R2_PRIVATE_BUCKET": "3dam-private",
            "R2_ENDPOINT_URL": "https://example.r2.cloudflarestorage.com",
        }
        with (
            patch.object(mod.sys, "argv", ["upload_backup_to_r2.py", dump_path]),
            patch.dict(mod.os.environ, env, clear=False),
            patch.dict("sys.modules", {"boto3": fake_boto3}),
        ):
            code = mod.main()

        self.assertEqual(code, 0)
        fake_boto3.client.assert_called_once()
        fake_client.upload_file.assert_called_once()
        _local, bucket, key = fake_client.upload_file.call_args[0]
        self.assertEqual(bucket, "3dam-private")
        self.assertTrue(key.startswith("backups/postgres/"))


if __name__ == "__main__":
    unittest.main()
