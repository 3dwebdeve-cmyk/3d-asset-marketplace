"""Phase I3 — batch intake Excel / fixture smoke (operator checklist)."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.batch_ingest_smoke import BatchIngestSmokeError, run_batch_ingest_smoke


class Command(BaseCommand):
    help = (
        "Validate frozen batch-ingest fixture CSV headers against "
        "docs/batch-ingest-contract.md, dry-run ready-to-import gates "
        "(happy / mismatch / gate-failures), and optionally apply happy-path "
        "import → QA approve. See docs/CATALOG_OPS_STAGING_CHECKLIST.md §I3."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--apply",
            action="store_true",
            help=(
                "Import happy fixture as pending_review, write a local package "
                "object, QA approve → published."
            ),
        )
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when advisory warnings remain after a successful run.",
        )

    def handle(self, *args, **options) -> None:
        apply = bool(options.get("apply"))
        try:
            result = run_batch_ingest_smoke(apply=apply)
        except BatchIngestSmokeError as exc:
            raise CommandError(str(exc)) from exc

        for check in result.checks:
            status = "OK" if check.ok else "FAIL"
            style = self.style.SUCCESS if check.ok else self.style.ERROR
            blocking = "" if check.blocking else " (advisory)"
            self.stdout.write(
                style(f"[{status}] {check.name}{blocking}: {check.detail}")
            )

        for warning in result.warnings:
            self.stdout.write(self.style.WARNING(warning))

        failures = result.blocking_failures
        if failures:
            names = ", ".join(c.name for c in failures)
            raise CommandError(
                f"Batch ingest smoke failed: {names}. "
                "See docs/batch-ingest-contract.md and "
                "docs/CATALOG_OPS_STAGING_CHECKLIST.md §I3."
            )

        if result.applied:
            self.stdout.write(
                self.style.SUCCESS(
                    f"batch_ingest_smoke OK applied sku={result.published_sku}"
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS("batch_ingest_smoke OK (dry-run)"))

        if options.get("fail_on_warnings") and result.warnings:
            raise CommandError(
                f"Batch ingest smoke has {len(result.warnings)} warning(s)."
            )
