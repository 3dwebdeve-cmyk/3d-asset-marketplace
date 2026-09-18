"""Verify Cloudflare R2 public + private bucket credentials and reachability."""

from django.core.management.base import BaseCommand, CommandError

from config.storages import R2VerificationError, verify_r2_buckets


class Command(BaseCommand):
    help = (
        "Head both R2_PUBLIC_BUCKET and R2_PRIVATE_BUCKET using current R2_* env. "
        "Fails if R2 is disabled or either bucket is unreachable."
    )

    def handle(self, *args, **options) -> None:
        try:
            results = verify_r2_buckets()
        except R2VerificationError as exc:
            raise CommandError(exc.message) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"R2 OK public={results['public']} private={results['private']}"
            )
        )
