"""Exercise scheduled checks with fake Docker; no live maintenance or email."""
import os
import subprocess
import tempfile
from pathlib import Path
from unittest import skipUnless

from django.test import SimpleTestCase

from config.test_backup_scripts import BASH

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


@skipUnless(BASH, "A working Bash is required")
class MaintenanceScriptTests(SimpleTestCase):
    def run_script(self, *failures, backup=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docker = root / "docker"
            docker.write_text(
                '#!/usr/bin/env bash\n'
                'printf "%s\\n" "$*" >> "$FAKE_DOCKER_LOG"\n'
                'for command in $FAKE_FAILURES; do\n'
                '  if [[ " $* " == *" $command "* ]]; then exit 7; fi\n'
                'done\n', encoding="utf-8",
            )
            docker.chmod(0o755)
            backups = root / "backups"
            backups.mkdir()
            if backup:
                (backups / "marketplace-test.dump").write_text("fixture")
            log = root / "calls.txt"
            env = {**os.environ, "PATH": str(root) + os.pathsep + os.environ.get("PATH", ""),
                   "FAKE_DOCKER_LOG": log.as_posix(), "FAKE_FAILURES": " ".join(failures),
                   "BACKUP_DIR": backups.as_posix()}
            result = subprocess.run([BASH, str(SCRIPTS / "run_maintenance.sh")],
                                    env=env, capture_output=True, text=True, timeout=30)
            return result, log.read_text() if log.exists() else ""

    def test_a_failed_payment_check_does_not_skip_scanner_capacity_or_backup(self):
        result, calls = self.run_script("check_payment_reconciliation")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(len(calls.splitlines()), 8)
        self.assertIn("check_package_scanner", calls)
        self.assertIn("check_capacity", calls)
        self.assertIn("maintenance_task_passed task=backup_freshness", result.stdout)
        self.assertIn("maintenance_finished passed=8 failed=1", result.stdout)
        self.assertIn("task=payment_consistency exit_code=7", result.stderr)

    def test_multiple_failures_are_all_reported(self):
        result, calls = self.run_script("send_review_reminders", "check_package_scanner", backup=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(len(calls.splitlines()), 8)
        self.assertIn("maintenance_finished passed=6 failed=3", result.stdout)
        self.assertIn("maintenance_failed_tasks approval_reminders scanner_health backup_freshness", result.stderr)

    def test_successful_run_returns_zero(self):
        result, calls = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(calls.splitlines()), 8)
        self.assertIn("maintenance_finished passed=9 failed=0", result.stdout)

    def test_installer_schedules_the_runner_without_changing_crontab_in_dry_run(self):
        result = subprocess.run([BASH, str(SCRIPTS / "install_maintenance_cron.sh")],
            env={**os.environ, "INSTALL_MAINTENANCE_CRON_DRY_RUN": "1"},
            capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("run_maintenance.sh", result.stdout)
        self.assertIn("# marketplace-phase3-maintenance", result.stdout)
        self.assertNotIn("|| echo", result.stdout)
