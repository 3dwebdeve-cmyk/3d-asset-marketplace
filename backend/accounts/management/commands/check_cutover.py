"""Phase K1 — orchestrate PRODUCTION_CHECKLIST §2 cutover gates."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from config.cutover_gate import CutoverGateError, CutoverProfile, run_cutover_gate


class Command(BaseCommand):
    help = (
        "Run Phase K1 cutover gate: deploy, email, Stripe, R2, Sentry, auth, "
        "ops, Meili, healthz for profile local|staging|production. "
        "Reuses existing report collectors — does not print secrets. "
        "See docs/CUTOVER_STAGING_CHECKLIST.md."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--profile",
            choices=("local", "staging", "production"),
            default="local",
            help=(
                "Gate strictness. staging = test Stripe + public hosts; "
                "production = live Stripe + external email + Sentry required."
            ),
        )
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help=(
                "Exit 1 when blocking checks fail, or when non-blocking "
                "warnings remain (use on staging/prod hosts)."
            ),
        )
        parser.add_argument(
            "--skip-django-deploy-check",
            action="store_true",
            help="Skip Django check --deploy inside the gate.",
        )
        parser.add_argument(
            "--require-smtp",
            action="store_true",
            help=(
                "Treat Brevo API/SMTP + real staff recipients as blocking "
                "(always on for --profile production)."
            ),
        )
        parser.add_argument(
            "--require-sentry",
            action="store_true",
            help=(
                "Treat SENTRY_DSN as blocking "
                "(always on for --profile production)."
            ),
        )

    def handle(self, *args, **options) -> None:
        profile: CutoverProfile = options["profile"]
        try:
            result = run_cutover_gate(
                profile=profile,
                django_deploy_check=not bool(
                    options.get("skip_django_deploy_check")
                ),
                require_smtp=bool(options.get("require_smtp")),
                require_sentry=bool(options.get("require_sentry")),
            )
        except CutoverGateError as exc:
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
                f"Cutover gate failed ({profile}): {names}. "
                "See docs/CUTOVER_STAGING_CHECKLIST.md."
            )

        if options.get("fail_on_warnings") and result.warnings:
            raise CommandError(
                f"Cutover gate has {len(result.warnings)} warning(s). "
                "Fix them on the host, then re-run with --fail-on-warnings."
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"cutover_gate OK ({profile}) — record date/initials in "
                "docs/CUTOVER_STAGING_CHECKLIST.md when done on the host."
            )
        )
