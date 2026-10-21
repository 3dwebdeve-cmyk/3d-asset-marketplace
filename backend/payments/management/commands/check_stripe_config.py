"""Report Stripe sandbox/staging readiness; optional Balance API ping / fulfill smoke."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from payments.stripe_config import collect_stripe_config_report, ping_stripe_api
from payments.stripe_smoke import StripeSmokeError, run_sandbox_fulfill_smoke


class Command(BaseCommand):
    help = (
        "Print Stripe key/webhook readiness without exposing secrets. "
        "Pass --require-test-mode for sandbox (sk_test_ / whsec_), or "
        "--require-live-mode before taking real payments. "
        "Pass --fail-on-warnings to exit 1 on launch-blocking issues. "
        "Pass --ping to call Stripe Balance.retrieve with the configured secret. "
        "Pass --smoke-fulfill for signed webhook fulfill + idempotent replay "
        "(test-mode; creates/deletes a throwaway order)."
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
            "--require-live-mode",
            action="store_true",
            help=(
                "Fail/warn unless STRIPE_PAYMENT_MODE=live with sk_live_ / pk_live_ "
                "keys and a whsec_ secret (docs/STRIPE_LIVE_CHECKLIST.md)."
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
        parser.add_argument(
            "--smoke-fulfill",
            action="store_true",
            help=(
                "Create a test Checkout Session, POST a HMAC-signed "
                "checkout.session.completed through the webhook view, assert "
                "paid order + entitlement + receipt, replay for idempotency, "
                "then clean up. Requires sk_test_ + whsec_; refuses "
                "E2E_STRIPE_SIMULATE. Does not print secrets."
            ),
        )
        parser.add_argument(
            "--keep-smoke-data",
            action="store_true",
            help=(
                "With --smoke-fulfill, leave the smoke user/order/payment in "
                "the database (default deletes them)."
            ),
        )

    def handle(self, *args, **options) -> None:
        require_test = bool(options.get("require_test_mode"))
        require_live = bool(options.get("require_live_mode"))
        smoke = bool(options.get("smoke_fulfill"))
        if smoke:
            if require_live:
                raise CommandError("--smoke-fulfill runs in test mode only; drop --require-live-mode.")
            require_test = True
        if require_test and require_live:
            raise CommandError("Pass either --require-test-mode or --require-live-mode, not both.")

        report = collect_stripe_config_report(
            require_test_mode=require_test,
            require_live_mode=require_live,
        )

        self.stdout.write(f"DEBUG={report.debug}")
        self.stdout.write(f"STRIPE_PAYMENT_MODE={report.payment_mode}")
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
        if not require_live:
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
            if require_live and mode != "live":
                raise CommandError(
                    f"Stripe answered in {mode} mode; --require-live-mode needs the live secret key."
                )
            self.stdout.write(
                self.style.SUCCESS(f"Stripe API ping OK (livemode={mode}).")
            )

        if report.warnings:
            for warning in report.warnings:
                self.stdout.write(self.style.ERROR(warning))
            if options["fail_on_warnings"] or smoke:
                raise CommandError(
                    f"Stripe config has {len(report.warnings)} issue(s). "
                    "See messages above and "
                    + (
                        "docs/STRIPE_LIVE_CHECKLIST.md."
                        if require_live
                        else "docs/STRIPE_SANDBOX_CHECKLIST.md."
                    )
                )
            self.stdout.write(
                self.style.WARNING(
                    f"{len(report.warnings)} issue(s) listed "
                    "(re-run with --fail-on-warnings on staging)."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "Stripe config looks ready for this env."
                )
            )

        if smoke:
            try:
                result = run_sandbox_fulfill_smoke(
                    cleanup=not bool(options.get("keep_smoke_data")),
                )
            except StripeSmokeError as exc:
                raise CommandError(str(exc)) from exc
            self.stdout.write(
                self.style.SUCCESS(
                    "smoke_fulfill OK: paid order + payment + entitlement + "
                    "receipt; webhook replay idempotent "
                    f"(cleaned_up={result.cleaned_up})."
                )
            )
            # Never print session/event/order UUIDs that could be mistaken for
            # secrets in shared logs — modes/flags only.
            self.stdout.write(
                "Optional browser card checkout remains in "
                "docs/STRIPE_SANDBOX_CHECKLIST.md section 3."
            )
            return

        if require_live:
            if not report.warnings:
                self.stdout.write(
                    "Operator: make one real purchase and refund it "
                    "(docs/STRIPE_LIVE_CHECKLIST.md)."
                )
            return

        if not report.warnings:
            self.stdout.write(
                "Operator: run --smoke-fulfill or one Dashboard test-card "
                "checkout + webhook replay (docs/STRIPE_SANDBOX_CHECKLIST.md)."
            )
