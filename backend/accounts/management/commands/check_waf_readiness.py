"""Phase H3 — Cloudflare WAF / bot-protection app-layer readiness."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.waf_readiness import WafReadinessError, run_waf_readiness


class Command(BaseCommand):
    help = (
        "Run Phase H3 WAF readiness: auth throttle rates/classes, shared "
        "Redis cache when DEBUG=False, Nginx CF-Connecting-IP map, SSL proxy "
        "header. Does not call Cloudflare. See docs/CLOUDFLARE_WAF_CHECKLIST.md."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help=(
                "Exit 1 when any blocking check fails, or when advisory "
                "warnings remain (use on staging/prod after edge is live)."
            ),
        )

    def handle(self, *args, **options) -> None:
        try:
            result = run_waf_readiness()
        except WafReadinessError as exc:
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
                f"WAF readiness failed: {names}. "
                "See docs/CLOUDFLARE_WAF_CHECKLIST.md."
            )

        if options.get("fail_on_warnings") and result.warnings:
            raise CommandError(
                f"WAF readiness has {len(result.warnings)} warning(s). "
                "On staging/prod enable Cloudflare WAF/Bot Fight, then "
                "re-run; local DEBUG advisories are expected."
            )

        self.stdout.write(
            self.style.SUCCESS(
                "waf_readiness OK - enable Cloudflare WAF/Bot Fight on the "
                "public host and record date/initials in "
                "docs/CLOUDFLARE_WAF_CHECKLIST.md / PRODUCTION_CHECKLIST.md."
            )
        )
