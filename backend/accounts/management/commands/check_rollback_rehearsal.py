"""Phase K2 — post-rollback rehearsal gate (healthz + purchase + webhook)."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.rollback_rehearsal import (
    RollbackProfile,
    RollbackRehearsalError,
    run_rollback_rehearsal,
)


class Command(BaseCommand):
    help = (
        "Run Phase K2 rollback rehearsal gate: immutable tag advisory, "
        "healthz, mocked purchase path, webhook idempotency (DB-backed). "
        "Optional --smoke-webhook uses real sk_test_ fulfill + replay. "
        "Does not print secrets. See docs/ROLLBACK_REHEARSAL.md."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--profile",
            choices=("local", "staging"),
            default="local",
            help=(
                "Gate strictness. staging treats :latest image tags as "
                "blocking and warns when DEBUG=True."
            ),
        )
        parser.add_argument(
            "--smoke-webhook",
            action="store_true",
            help=(
                "Also run payments.stripe_smoke sandbox fulfill + "
                "idempotent replay (requires sk_test_ + webhook secret)."
            ),
        )
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help=(
                "Exit 1 when blocking checks fail, or when advisory "
                "warnings remain (use on staging after image rollback)."
            ),
        )

    def handle(self, *args, **options) -> None:
        profile: RollbackProfile = options["profile"]
        try:
            result = run_rollback_rehearsal(
                profile=profile,
                smoke_webhook=bool(options.get("smoke_webhook")),
            )
        except RollbackRehearsalError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(f"profile={result.profile}")
        self.stdout.write(f"DEBUG={result.debug}")
        for check in result.checks:
            status = "OK" if check.ok else "FAIL"
            style = self.style.SUCCESS if check.ok else self.style.ERROR
            advisory = "" if check.blocking else " (advisory)"
            self.stdout.write(
                style(f"[{status}] {check.name}{advisory}: {check.detail}")
            )

        for warning in result.warnings:
            self.stdout.write(self.style.WARNING(warning))

        self.stdout.write("")
        self.stdout.write("Manual host steps (not automated by this gate):")
        for reminder in result.manual_reminders:
            self.stdout.write(f"  - {reminder}")

        failures = result.blocking_failures
        if failures:
            names = ", ".join(c.name for c in failures)
            raise CommandError(
                f"Rollback rehearsal failed ({profile}): {names}. "
                "See docs/ROLLBACK_REHEARSAL.md."
            )

        if options.get("fail_on_warnings") and result.warnings:
            raise CommandError(
                f"Rollback rehearsal has {len(result.warnings)} warning(s). "
                "Fix them on the host, then re-run with --fail-on-warnings."
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"rollback_rehearsal OK ({profile}) - record date/initials in "
                "docs/ROLLBACK_REHEARSAL.md when done on the host."
            )
        )
