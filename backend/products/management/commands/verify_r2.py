"""Verify Cloudflare R2 public + private bucket credentials and reachability."""

from django.core.management.base import BaseCommand, CommandError

from config.r2_smoke import R2SmokeError, run_private_presign_smoke
from config.storages import R2VerificationError, verify_r2_buckets


class Command(BaseCommand):
    help = (
        "Head both R2_PUBLIC_BUCKET and R2_PRIVATE_BUCKET using current R2_* env. "
        "Fails if R2 is disabled or either bucket is unreachable. "
        "Pass --smoke-presign to put a tiny private object, resolve a signed "
        "download JSON (no storage_path), GET it, then delete the object."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--smoke-presign",
            action="store_true",
            help=(
                "After bucket heads succeed, exercise resolve_private_download "
                "with a throwaway private object (put → signed JSON → GET → delete). "
                "Does not print secrets or storage paths."
            ),
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

        if not options.get("smoke_presign"):
            return

        try:
            smoke = run_private_presign_smoke()
        except R2SmokeError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.SUCCESS(
                "R2 smoke-presign OK "
                f"signed_json={smoke.signed_json_ok} "
                f"storage_path_omitted={smoke.storage_path_omitted} "
                f"expires_in={smoke.expires_in} "
                f"fetch={smoke.fetch_ok} "
                f"cleaned_up={smoke.cleaned_up}"
            )
        )
        if not smoke.cleaned_up:
            self.stdout.write(
                self.style.WARNING(
                    "Smoke object may remain under _verify_r2_smoke/ — delete manually."
                )
            )
