"""Run the daily maintenance tasks forever (hosts without cron, such as Render's free plan).

The container entrypoint starts this beside Gunicorn when ``RUN_MAINTENANCE_LOOP_IN_WEB`` is
set. Each task is isolated: a failure is logged (Sentry picks up error logs) and the loop
carries on. All tasks are safe to repeat, so a restart or a second container does no harm.
"""

from __future__ import annotations

import logging
import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import close_old_connections

logger = logging.getLogger(__name__)


def maintenance_tasks() -> list[tuple[str, tuple, dict]]:
    tasks: list[tuple[str, tuple, dict]] = [
        ("prune_expired_records", (), {"execute": True}),
        ("manage_background_jobs", ("prune",), {"older_than_days": 30, "execute": True}),
        ("check_payment_reconciliation", (), {}),
    ]
    # Only against a live Stripe account: a test account holds old sandbox payments that
    # would raise false alarms every day.
    if getattr(settings, "STRIPE_PAYMENT_MODE", "test") == "live":
        tasks.append(("reconcile_stripe_payments", (), {}))
    return tasks


def run_once() -> dict[str, bool]:
    results: dict[str, bool] = {}
    for name, args, kwargs in maintenance_tasks():
        close_old_connections()
        try:
            call_command(name, *args, **kwargs)
            results[name] = True
        except Exception as exc:  # noqa: BLE001 - one task must never stop the others
            # Name and exception type only; messages can carry record details.
            logger.error("maintenance_task_failed task=%s error=%s", name, type(exc).__name__)
            results[name] = False
    return results


class Command(BaseCommand):
    help = "Run daily maintenance forever: prune old records, check payments, reconcile with Stripe."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Run every task once and exit.")
        parser.add_argument("--startup-delay-seconds", type=int, default=600)
        parser.add_argument("--interval-hours", type=float, default=24)

    def handle(self, *args, **options):
        if options["once"]:
            run_once()
            return
        time.sleep(max(0, options["startup_delay_seconds"]))
        while True:
            results = run_once()
            logger.info("maintenance_run_finished ok=%s failed=%s",
                        sum(results.values()), len(results) - sum(results.values()))
            time.sleep(max(60.0, options["interval_hours"] * 3600))
