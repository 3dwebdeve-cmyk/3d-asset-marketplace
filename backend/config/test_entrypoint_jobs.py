"""The container entrypoint can run extra processes beside Gunicorn (Render free tier)."""

import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from unittest import skipIf

from django.test import SimpleTestCase

ENTRYPOINT = Path(__file__).resolve().parent.parent / "entrypoint.sh"


def _text() -> str:
    return ENTRYPOINT.read_text(encoding="utf-8").replace("\r\n", "\n")


def _block(name: str) -> str:
    text = _text()
    return text[text.index(f"# BEGIN {name}"):text.index(f"# END {name}")]


class EntrypointStaticTests(SimpleTestCase):
    def test_job_processor_is_off_unless_enabled_and_only_for_gunicorn(self):
        block = _block("web background jobs")
        self.assertIn('${RUN_BACKGROUND_JOBS_IN_WEB:-}', block)
        self.assertIn('"${1:-}" = "gunicorn"', block)
        self.assertIn("python manage.py process_background_jobs", block)

    def test_maintenance_loop_is_off_unless_enabled_and_only_for_gunicorn(self):
        block = _block("web maintenance loop")
        self.assertIn('${RUN_MAINTENANCE_LOOP_IN_WEB:-}', block)
        self.assertIn('"${1:-}" = "gunicorn"', block)
        self.assertIn("python manage.py run_maintenance_loop", block)

    def test_bootstrap_needs_both_variables_and_gunicorn(self):
        block = _block("bootstrap administrator")
        for needle in ('"${1:-}" = "gunicorn"', "BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_PASSWORD",
                       "python manage.py bootstrap_administrator"):
            self.assertIn(needle, block)

    def test_a_failed_bootstrap_does_not_stop_the_site(self):
        self.assertIn("bootstrap_administrator ||", _block("bootstrap administrator"))

    def test_order_migrate_then_admin_then_startup_checks_then_exec(self):
        text = _text()
        order = [
            text.index("python manage.py migrate --noinput"),
            text.index("# BEGIN bootstrap administrator"),
            text.index("python manage.py check_cutover"),
            text.index("# BEGIN web background jobs"),
            text.rindex('exec "$@"'),
        ]
        self.assertEqual(order, sorted(order))


@skipIf(os.name == "nt" or shutil.which("sh") is None, "needs a POSIX shell")
class EntrypointBehaviourTests(SimpleTestCase):
    """Runs the real blocks with a stand-in `python` that only records its arguments."""

    def _run(self, block, *, command, env_vars=None):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "calls.log"
            fake = Path(tmp) / "python"
            fake.write_text(f'#!/bin/sh\necho "$@" >> "{log}"\n')
            fake.chmod(0o755)
            env = {k: v for k, v in os.environ.items()
                   if not k.startswith(("RUN_", "BOOTSTRAP_ADMIN"))}
            env["PATH"] = f"{tmp}:{env['PATH']}"
            env.update(env_vars or {})
            script = f"set -u\nset -- {command}\n{_block(block)}\nsleep 1.5\nkill $(jobs -p) 2>/dev/null\nexit 0\n"
            subprocess.run(["sh", "-c", script], env=env, timeout=20,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.2)
            return log.read_text() if log.exists() else ""

    def test_job_processor_starts_with_gunicorn_when_enabled(self):
        calls = self._run("web background jobs", command="gunicorn app",
                          env_vars={"RUN_BACKGROUND_JOBS_IN_WEB": " true "})
        self.assertIn("manage.py process_background_jobs", calls)

    def test_job_processor_stays_off_otherwise(self):
        block = "web background jobs"
        self.assertEqual(self._run(block, command="gunicorn app"), "")
        self.assertEqual(self._run(block, command="gunicorn app",
                                   env_vars={"RUN_BACKGROUND_JOBS_IN_WEB": "false"}), "")
        self.assertEqual(self._run(block, command="python manage.py process_background_jobs",
                                   env_vars={"RUN_BACKGROUND_JOBS_IN_WEB": "true"}), "")

    def test_maintenance_loop_starts_only_when_enabled(self):
        block = "web maintenance loop"
        on = self._run(block, command="gunicorn app", env_vars={"RUN_MAINTENANCE_LOOP_IN_WEB": "true"})
        self.assertIn("manage.py run_maintenance_loop", on)
        self.assertEqual(self._run(block, command="gunicorn app"), "")
        self.assertEqual(self._run(block, command="worker", env_vars={"RUN_MAINTENANCE_LOOP_IN_WEB": "true"}), "")

    def test_bootstrap_runs_only_with_both_variables(self):
        block = "bootstrap administrator"
        both = {"BOOTSTRAP_ADMIN_EMAIL": "ops@example.test", "BOOTSTRAP_ADMIN_PASSWORD": "x" * 14}
        self.assertIn("manage.py bootstrap_administrator", self._run(block, command="gunicorn app", env_vars=both))
        self.assertEqual(self._run(block, command="gunicorn app",
                                   env_vars={"BOOTSTRAP_ADMIN_EMAIL": "ops@example.test"}), "")
        self.assertEqual(self._run(block, command="gunicorn app",
                                   env_vars={"BOOTSTRAP_ADMIN_PASSWORD": "x" * 14}), "")
        self.assertEqual(self._run(block, command="python manage.py migrate", env_vars=both), "")
