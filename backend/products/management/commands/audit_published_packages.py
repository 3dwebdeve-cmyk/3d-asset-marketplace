"""Report published products/plugins missing private package objects."""

from django.core.management.base import BaseCommand, CommandError

from config.package_audit import PublishedPackageAuditService


class Command(BaseCommand):
    help = (
        "Audit every published product and plugin for a resolvable private package. "
        "Use before launch so buyers are never charged for a missing file. "
        "Pass --fail-on-missing to exit non-zero when issues are found."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-missing",
            action="store_true",
            help="Exit with status 1 when any published SKU lacks a package object.",
        )

    def handle(self, *args, **options) -> None:
        issues = PublishedPackageAuditService.audit()
        if not issues:
            self.stdout.write(
                self.style.SUCCESS("All published products and plugins have packages.")
            )
            return

        for issue in issues:
            path = f" path={issue.storage_path}" if issue.storage_path else ""
            self.stdout.write(
                self.style.WARNING(
                    f"{issue.kind} id={issue.object_id} label={issue.label} "
                    f"reason={issue.reason}{path}"
                )
            )

        summary = (
            f"Found {len(issues)} published SKU(s) without a resolvable private package. "
            "Upload packages or unpublish before launch."
        )
        if options["fail_on_missing"]:
            raise CommandError(summary)
        self.stdout.write(self.style.ERROR(summary))
