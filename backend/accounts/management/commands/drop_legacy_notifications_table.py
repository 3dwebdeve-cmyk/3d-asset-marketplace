"""Optionally drop a leftover Feature 10 ``notifications`` table if present.

The in-app notifications Django app and frontend inbox are removed (email-only).
Some databases may still have an orphaned ``notifications`` table from the old
Feature 10 ship. This command only drops it when explicitly confirmed.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = (
        "Report or drop a leftover ``notifications`` table from Feature 10. "
        "Requires --confirm to DROP. Prefer a DB backup first."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Actually DROP TABLE IF EXISTS notifications (irreversible).",
        )

    def handle(self, *args, **options) -> None:
        table = "notifications"
        existing = set(connection.introspection.table_names())
        present = table in existing
        self.stdout.write(f"notifications_table_present={present}")

        if not present:
            self.stdout.write(
                self.style.SUCCESS(
                    "No leftover notifications table — G2 cleanup already complete."
                )
            )
            return

        if not options["confirm"]:
            self.stdout.write(
                self.style.WARNING(
                    "Table exists. Re-run with --confirm after backup to DROP it. "
                    "Email-only alerts remain (orders/custom_projects/contact)."
                )
            )
            return

        with connection.cursor() as cursor:
            cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
        self.stdout.write(
            self.style.SUCCESS(f"Dropped leftover table `{table}`.")
        )
