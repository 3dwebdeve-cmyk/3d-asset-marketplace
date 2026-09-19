"""Phase H2 — formal security smoke (operator checklist automation)."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.security_smoke import SecuritySmokeError, run_security_smoke


class Command(BaseCommand):
    help = (
        "Run Phase H2 security smoke: deploy hygiene, login throttle, "
        "unauth download, unsigned private media, bad Stripe webhook, "
        "CORS/CSRF allowlist, Django /admin/ lock, OpenAPI gate. "
        "Does not print secrets. See docs/SECURITY_SMOKE_CHECKLIST.md."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help=(
                "Exit 1 when any blocking check fails, or when non-blocking "
                "warnings remain (use on staging/prod)."
            ),
        )
        parser.add_argument(
            "--skip-django-deploy-check",
            action="store_true",
            help="Skip Django check --deploy inside the deploy_hygiene step.",
        )

    def handle(self, *args, **options) -> None:
        try:
            result = run_security_smoke(
                django_deploy_check=not bool(
                    options.get("skip_django_deploy_check")
                ),
            )
        except SecuritySmokeError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(f"DEBUG={result.debug}")
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
                f"Security smoke failed: {names}. "
                "See docs/SECURITY_SMOKE_CHECKLIST.md."
            )

        if options.get("fail_on_warnings") and result.warnings:
            raise CommandError(
                f"Security smoke has {len(result.warnings)} warning(s). "
                "Fix them on staging/prod, then re-run with --fail-on-warnings."
            )

        self.stdout.write(
            self.style.SUCCESS(
                "security_smoke OK - record date/initials in "
                "docs/PRODUCTION_CHECKLIST.md when done on the host."
            )
        )
