"""Tests for the backup helpers. No network, no Docker; the shell script runs with fakes."""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
RECIPIENT = "age1" + "q" * 58


def _load_upload_module():
    path = SCRIPTS_DIR / "upload_backup_to_r2.py"
    spec = importlib.util.spec_from_file_location("upload_backup_to_r2", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _bash() -> str | None:
    bash = shutil.which("bash")
    if not bash:
        return None
    try:
        probe = subprocess.run([bash, "-c", "echo ok"], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return bash if probe.stdout.strip() == "ok" else None


BASH = _bash()

# Fake pg_dump: records its arguments, one per line, and prints a fake dump.
FAKE_PG_DUMP = """#!/usr/bin/env bash
printf '%s\\n' "$@" > "$FAKE_ARGS_FILE"
if [[ "${FAKE_PG_EXIT:-0}" != "0" ]]; then
  echo "pg_dump: connection failed" >&2
  exit "$FAKE_PG_EXIT"
fi
printf 'PGDMP-fake-dump'
"""

# Fake age: `age -r RECIPIENT -o OUT` reads stdin and writes an "encrypted" file.
FAKE_AGE = """#!/usr/bin/env bash
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -r) shift 2 ;;
    -o) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
{ printf 'age-encryption.org/v1\\n'; cat; } > "$out"
"""


class BackupScriptsPresentTests(unittest.TestCase):
    def test_backup_script_documents_retention_and_drill(self) -> None:
        text = (SCRIPTS_DIR / "backup_postgres.sh").read_text(encoding="utf-8")
        self.assertIn("BACKUP_RETENTION_DAYS", text)
        self.assertIn("restore_postgres_drill.sh", text)
        self.assertIn("BACKUP_UPLOAD_R2", text)
        self.assertIn("BACKUP_AGE_RECIPIENT", text)
        self.assertIn(r"$'\r'", text)

    def test_shell_scripts_have_no_literal_backslash_n(self) -> None:
        # A literal "\n" where a line continuation was meant once broke every backup:
        # bash reads it as an extra "n" argument to pg_dump.
        for path in SCRIPTS_DIR.glob("*.sh"):
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if "printf" in line:
                    continue
                with self.subTest(script=path.name, line=number):
                    self.assertNotIn("\\n ", line)

    def test_restore_drill_script_is_disposable_only(self) -> None:
        text = (SCRIPTS_DIR / "restore_postgres_drill.sh").read_text(encoding="utf-8")
        self.assertIn("marketplace-restore-drill-", text)
        self.assertIn("marketplace_restore_drill_", text)
        self.assertIn("RESTORE_DRILL_MODE", text)
        self.assertIn("postgres_data", text)
        self.assertIn("BACKUP_AGE_IDENTITY", text)
        self.assertNotIn("RESTORE_IN_PLACE", text)

    def test_install_backup_cron_script_documents_retention(self) -> None:
        path = SCRIPTS_DIR / "install_backup_cron.sh"
        self.assertTrue(path.is_file())
        text = path.read_text(encoding="utf-8")
        self.assertIn('BACKUP_RETENTION_DAYS:-30', text)
        self.assertIn("BACKUP_UPLOAD_R2", text)
        self.assertIn("BACKUP_AGE_RECIPIENT", text)


@unittest.skipUnless(BASH, "bash is required to run backup_postgres.sh")
class BackupPostgresScriptTests(unittest.TestCase):
    """Runs the real script with fake pg_dump and age on PATH."""

    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        scripts = self.root / "backend" / "scripts"
        scripts.mkdir(parents=True)
        source = (SCRIPTS_DIR / "backup_postgres.sh").read_text(encoding="utf-8")
        # Git stores LF; a Windows checkout may have CRLF, which bash does not accept.
        (scripts / "backup_postgres.sh").write_text(source.replace("\r\n", "\n"), newline="\n")
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        (bin_dir / "pg_dump").write_text(FAKE_PG_DUMP, newline="\n")
        (bin_dir / "age").write_text(FAKE_AGE, newline="\n")
        for tool in ("pg_dump", "age"):
            (bin_dir / tool).chmod(0o755)
        self.backups = self.root / "backups"
        self.args_file = self.root / "pg_dump_args.txt"

    def _run(self, **env: str) -> subprocess.CompletedProcess:
        environment = {
            **os.environ,
            "BACKUP_DIR": str(self.backups),
            "BACKUP_VIA_COMPOSE": "0",
            "DB_NAME": "shopdb",
            "DB_USER": "backup_user",
            "DB_HOST": "db.internal",
            "DB_PORT": "5433",
            "DB_PASSWORD": "secret",
            "FAKE_ARGS_FILE": str(self.args_file),
            "DEPLOYMENT_PROFILE": "development",
            **env,
        }
        for name in ("BACKUP_AGE_RECIPIENT", "BACKUP_UPLOAD_R2", "BACKUP_REQUIRE_ENCRYPTION"):
            if name not in env:
                environment.pop(name, None)
        return subprocess.run(
            [BASH, "-c", 'export PATH="$(pwd)/bin:$PATH"; bash backend/scripts/backup_postgres.sh'],
            cwd=self.root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=60,
        )

    def _files(self) -> list[str]:
        return sorted(p.name for p in self.backups.iterdir()) if self.backups.exists() else []

    def test_encrypted_production_backup(self) -> None:
        result = self._run(DEPLOYMENT_PROFILE="production", BACKUP_AGE_RECIPIENT=RECIPIENT)
        self.assertEqual(result.returncode, 0, result.stderr)

        files = self._files()
        self.assertEqual(len(files), 1)
        self.assertRegex(files[0], r"^marketplace-\d{8}T\d{6}Z\.dump\.age$")
        content = (self.backups / files[0]).read_bytes()
        self.assertTrue(content.startswith(b"age-encryption.org/v1"))
        self.assertIn(b"PGDMP-fake-dump", content)
        # Exactly these arguments: no stray tokens from broken line continuations.
        self.assertEqual(
            self.args_file.read_text().split(),
            ["-h", "db.internal", "-p", "5433", "-U", "backup_user", "-d", "shopdb", "-Fc"],
        )

    def test_production_refuses_without_recipient(self) -> None:
        result = self._run(DEPLOYMENT_PROFILE="production")
        self.assertEqual(result.returncode, 1)
        self.assertIn("refusing an unencrypted backup", result.stderr)
        self.assertFalse(self.args_file.exists())
        self.assertEqual(self._files(), [])

    def test_upload_refuses_without_recipient_even_in_development(self) -> None:
        result = self._run(BACKUP_UPLOAD_R2="1")
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.args_file.exists())

    def test_invalid_recipient_is_refused(self) -> None:
        result = self._run(BACKUP_AGE_RECIPIENT="not-a-key")
        self.assertEqual(result.returncode, 1)
        self.assertIn("not an age public key", result.stderr)

    def test_failed_pg_dump_leaves_no_file(self) -> None:
        result = self._run(BACKUP_AGE_RECIPIENT=RECIPIENT, FAKE_PG_EXIT="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self._files(), [])

    def test_development_without_recipient_writes_plain_dump(self) -> None:
        result = self._run()
        self.assertEqual(result.returncode, 0, result.stderr)
        files = self._files()
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".dump"))
        self.assertEqual((self.backups / files[0]).read_bytes(), b"PGDMP-fake-dump")


class UploadBackupToR2Tests(unittest.TestCase):
    BASE_ENV = {
        "R2_ACCESS_KEY_ID": "app-key",
        "R2_PUBLIC_BUCKET": "3dam-public",
        "R2_PRIVATE_BUCKET": "3dam-private",
        "R2_BACKUP_BUCKET": "3dam-backups",
        "R2_BACKUP_ACCESS_KEY_ID": "backup-key",
        "R2_BACKUP_SECRET_ACCESS_KEY": "backup-secret",
        "R2_ENDPOINT_URL": "https://example.r2.cloudflarestorage.com",
    }

    def _dump(self, suffix: str = ".dump.age") -> str:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(b"age-encryption.org/v1")
            path = handle.name
        self.addCleanup(Path(path).unlink, missing_ok=True)
        return path

    def _upload(self, dump_path: str, **overrides: str):
        mod = _load_upload_module()
        fake_client = MagicMock()
        fake_boto3 = MagicMock()
        fake_boto3.client.return_value = fake_client
        with (
            patch.object(mod.sys, "argv", ["upload_backup_to_r2.py", dump_path]),
            patch.dict(mod.os.environ, {**self.BASE_ENV, **overrides}, clear=True),
            patch.dict("sys.modules", {"boto3": fake_boto3}),
        ):
            code = mod.main()
        return code, fake_boto3, fake_client

    def test_missing_file_exits(self) -> None:
        mod = _load_upload_module()
        with patch.object(mod.sys, "argv", ["upload_backup_to_r2.py", "nope.dump.age"]):
            self.assertEqual(mod.main(), 1)

    def test_uploads_encrypted_dump_with_backup_key(self) -> None:
        code, fake_boto3, fake_client = self._upload(self._dump())
        self.assertEqual(code, 0)
        self.assertEqual(fake_boto3.client.call_args.kwargs["aws_access_key_id"], "backup-key")
        _local, bucket, key = fake_client.upload_file.call_args[0]
        self.assertEqual(bucket, "3dam-backups")
        self.assertTrue(key.startswith("postgres/") and key.endswith(".dump.age"))

    def test_refuses_unencrypted_dump(self) -> None:
        code, _boto3, fake_client = self._upload(self._dump(suffix=".dump"))
        self.assertEqual(code, 1)
        fake_client.upload_file.assert_not_called()

    def test_refuses_app_bucket(self) -> None:
        for bucket in ("3dam-public", "3dam-private"):
            with self.subTest(bucket=bucket):
                code, _boto3, fake_client = self._upload(self._dump(), R2_BACKUP_BUCKET=bucket)
                self.assertEqual(code, 1)
                fake_client.upload_file.assert_not_called()

    def test_refuses_app_key(self) -> None:
        code, _boto3, fake_client = self._upload(self._dump(), R2_BACKUP_ACCESS_KEY_ID="app-key")
        self.assertEqual(code, 1)
        fake_client.upload_file.assert_not_called()

    def test_refuses_without_backup_credentials(self) -> None:
        code, _boto3, fake_client = self._upload(self._dump(), R2_BACKUP_SECRET_ACCESS_KEY="")
        self.assertEqual(code, 1)
        fake_client.upload_file.assert_not_called()


class BackupKeyOutsideAppTests(unittest.TestCase):
    """The app must never hold the backup token: code execution would expose backups."""

    def test_production_refuses_backup_key_in_app_environment(self) -> None:
        from config.settings_guard_testing import import_settings

        result = import_settings(
            DEPLOYMENT_PROFILE="production", R2_BACKUP_SECRET_ACCESS_KEY="backup-secret"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("R2_BACKUP_SECRET_ACCESS_KEY must not be in the app environment", result.stderr)

    def test_development_tolerates_backup_key(self) -> None:
        from config.settings_guard_testing import import_settings

        result = import_settings(R2_BACKUP_SECRET_ACCESS_KEY="backup-secret")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_compose_never_loads_the_backup_env_file(self) -> None:
        root = SCRIPTS_DIR.parents[1]
        for compose in root.glob("docker-compose*.yml"):
            with self.subTest(file=compose.name):
                self.assertNotIn(".env.backup", compose.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
