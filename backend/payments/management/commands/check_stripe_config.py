"""Report Stripe sandbox/staging readiness; optional Balance API ping."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from payments.stripe_config import collect_stripe_config_report, ping_stripe_api


class Command(BaseCommand):
    help = (
        "Print Stripe key/webhook readiness without exposing secrets. "
        "Pass --require-test-mode for sandbox (sk_test_ / whsec_). "
        "Pass --fail-on-warnings to exit 1 on launch-blocking issues. "
        "Pass --ping to call Stripe Balance.retrieve with the configured secret."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--require-test-mode",
            action="store_true",
            help=(
                "Fail/warn when live keys are set or sandbox keys/webhook secret "
                "are missing (Phase B1 — docs/STRIPE_SANDBOX_CHECKLIST.md)."
            ),
        )
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when launch-blocking Stripe issues are detected.",
        )
        parser.add_argument(
            "--ping",
            action="store_true",
            help=(
                "Call Stripe Balance.retrieve to verify STRIPE_SECRET_KEY. "
                "Requires network; does not print the key."
            ),
        )

    def handle(self, *args, **options) -> None:
        require_test = bool(options.get("require_test_mode"))
        report = collect_stripe_config_report(require_test_mode=require_test)

        self.stdout.write(f"DEBUG={report.debug}")
        self.stdout.write(f"STRIPE_SECRET_KEY_mode={report.secret_mode}")
        self.stdout.write(f"STRIPE_PUBLISHABLE_KEY_mode={report.publishable_mode}")
        self.stdout.write(f"STRIPE_WEBHOOK_SECRET_set={report.webhook_secret_set}")
        self.stdout.write(
            f"STRIPE_WEBHOOK_SECRET_looks_valid={report.webhook_secret_looks_valid}"
        )
        self.stdout.write(f"E2E_STRIPE_SIMULATE={report.e2e_simulate}")
        self.stdout.write(f"webhook_path={report.webhook_path}")
        self.stdout.write(
            "webhook_event_types=" + ",".join(report.event_types)
        )
        self.stdout.write(
            "Sandbox steps: docs/STRIPE_SANDBOX_CHECKLIST.md - "
            "stripe listen --forward-to localhost:8000"
            f"{report.webhook_path}"
        )

        if options.get("ping"):
            if report.secret_mode == "empty":
                raise CommandError(
                    "Cannot --ping: STRIPE_SECRET_KEY is empty. "
                    "Set sk_test_… first (see docs/STRIPE_SANDBOX_CHECKLIST.md)."
                )
            try:
                mode = ping_stripe_api()
            except Exception as exc:
                raise CommandError(
                    f"Stripe Balance.retrieve failed: {exc}"
                ) from exc
            self.stdout.write(
                self.style.SUCCESS(f"Stripe API ping OK (livemode={mode}).")
            )

        if not report.warnings:
            self.stdout.write(
                self.style.SUCCESS(
                    "Stripe config looks ready for this env "
                    "(operator: still run one test-mode checkout + webhook replay)."
                )
            )
            return

        for warning in report.warnings:
            self.stdout.write(self.style.ERROR(warning))
        if options["fail_on_warnings"]:
            raise CommandError(
                f"Stripe config has {len(report.warnings)} issue(s). "
                "See messages above and docs/STRIPE_SANDBOX_CHECKLIST.md."
            )
        self.stdout.write(
            self.style.WARNING(
                f"{len(report.warnings)} issue(s) listed "
                "(re-run with --fail-on-warnings on staging)."
            )
        )
