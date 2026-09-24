"""Phase J1 — light load smoke on critical paths (operator checklist automation)."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.load_smoke import LoadSmokeError, run_load_smoke


class Command(BaseCommand):
    help = (
        "Run Phase J1 load smoke: healthz, product list/detail/search, "
        "checkout session create (Stripe mocked), public CDN URL shape when "
        "R2 is on, optional soak iterations. Does not print secrets. "
        "See docs/LOAD_SMOKE_CHECKLIST.md."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--iterations",
            type=int,
            default=1,
            help=(
                "Repeat browse/detail/search this many times (default 1). "
                "Use 20–50 for a light soak; max 200."
            ),
        )
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help=(
                "Exit 1 when any blocking check fails, or when advisory "
                "warnings remain (use on staging/prod after CDN is live)."
            ),
        )

    def handle(self, *args, **options) -> None:
        iterations = int(options["iterations"])
        try:
            result = run_load_smoke(iterations=iterations)
        except LoadSmokeError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(f"DEBUG={result.debug}")
        self.stdout.write(f"iterations={result.iterations}")
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
                f"Load smoke failed: {names}. "
                "See docs/LOAD_SMOKE_CHECKLIST.md."
            )

        if options.get("fail_on_warnings") and result.warnings:
            raise CommandError(
                f"Load smoke has {len(result.warnings)} warning(s). "
                "On staging/prod confirm R2_PUBLIC_BASE_URL / CDN and "
                "re-run; local DEBUG advisories are expected."
            )

        self.stdout.write(
            self.style.SUCCESS(
                "load_smoke OK - record date/initials in "
                "docs/LOAD_SMOKE_CHECKLIST.md when done on the host."
            )
        )
