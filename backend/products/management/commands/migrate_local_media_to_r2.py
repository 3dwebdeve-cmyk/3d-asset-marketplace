from django.core.management.base import BaseCommand, CommandError

from config.media_migration import LocalMediaMigrationService, MediaMigrationError


class Command(BaseCommand):
    help = (
        "Copy leftover local MEDIA_ROOT catalog files to Cloudflare R2 and rewrite "
        "public thumbnail/preview/gallery/avatar URLs. Requires R2_* env vars. "
        "Use --dry-run to report without writing."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count copy/rewrite work without changing storage or the database.",
        )

    def handle(self, *args, **options) -> None:
        dry_run = bool(options["dry_run"])
        try:
            stats = LocalMediaMigrationService.migrate(dry_run=dry_run)
        except MediaMigrationError as exc:
            raise CommandError(exc.message) from exc

        prefix = "DRY RUN " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}copied={stats.copied} existed={stats.existed} "
                f"missing={stats.missing} rewritten={stats.rewritten} "
                f"skipped={stats.skipped}"
            )
        )
        if stats.errors:
            self.stderr.write(
                self.style.ERROR(f"copy errors ({len(stats.errors)}): {stats.errors[:10]}")
            )
