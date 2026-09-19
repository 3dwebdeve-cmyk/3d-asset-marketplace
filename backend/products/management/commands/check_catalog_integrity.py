"""Read-only polymorphic catalog FK integrity report."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.catalog_integrity import collect_catalog_integrity_report


class Command(BaseCommand):
    help = (
        "Report cart/wishlist/review (blocking) and order/download (advisory) "
        "rows whose product_id is missing from products/plugins. Does not mutate "
        "data. See docs/PRODUCTION_CHECKLIST.md."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-orphans",
            action="store_true",
            help="Exit 1 when blocking cart/wishlist/review orphans exist.",
        )

    def handle(self, *args, **options) -> None:
        report = collect_catalog_integrity_report()
        for bucket in report.buckets:
            status = "OK" if bucket.total == 0 else "ORPHANS"
            style = self.style.SUCCESS if bucket.total == 0 else self.style.WARNING
            kind = "blocking" if bucket.blocking else "advisory"
            self.stdout.write(
                style(
                    f"[{status}] {bucket.name} ({kind}): "
                    f"product={bucket.product_orphans} plugin={bucket.plugin_orphans}"
                )
            )

        if report.ok:
            self.stdout.write(self.style.SUCCESS("catalog_integrity OK"))
            return

        self.stdout.write(
            self.style.WARNING(
                f"blocking_orphans={report.blocking_orphans} "
                f"advisory_orphans={report.advisory_orphans}"
            )
        )
        if options.get("fail_on_orphans") and report.blocking_orphans:
            raise CommandError(
                f"Catalog integrity failed: {report.blocking_orphans} "
                "blocking orphan(s) in cart/wishlist/reviews."
            )
        self.stdout.write(
            "Re-run with --fail-on-orphans on staging after live catalog is loaded."
        )
