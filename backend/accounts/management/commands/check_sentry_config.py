"""Report Sentry readiness: DSN presence, environment, optional test event."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Print Sentry configuration used by Django/Celery error reporting. "
        "Pass --fail-on-warnings when DEBUG=False and SENTRY_DSN is empty. "
        "Pass --send-test-event to capture a harmless info message (requires DSN)."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when launch-blocking Sentry issues are detected.",
        )
        parser.add_argument(
            "--send-test-event",
            action="store_true",
            help=(
                "Send a test info event to Sentry and flush. "
                "No-op when SENTRY_DSN is blank."
            ),
        )

    def handle(self, *args, **options) -> None:
        dsn = (getattr(settings, "SENTRY_DSN", "") or "").strip()
        environment = (
            getattr(settings, "SENTRY_ENVIRONMENT", "") or ""
        ).strip() or "(empty)"
        release = (getattr(settings, "SENTRY_RELEASE", "") or "").strip() or "(unset)"
        traces = getattr(settings, "SENTRY_TRACES_SAMPLE_RATE", 0.0)
        warnings: list[str] = []

        self.stdout.write(f"DEBUG={settings.DEBUG}")
        self.stdout.write(f"SENTRY_DSN_set={bool(dsn)}")
        self.stdout.write(f"SENTRY_ENVIRONMENT={environment}")
        self.stdout.write(f"SENTRY_RELEASE={release}")
        self.stdout.write(f"SENTRY_TRACES_SAMPLE_RATE={traces}")
        self.stdout.write(
            "Frontend uses VITE_SENTRY_DSN (bake at Vite/image build) — "
            "see docs/SENTRY_STAGING_CHECKLIST.md"
        )

        if not dsn:
            if settings.DEBUG:
                self.stdout.write(
                    self.style.WARNING(
                        "SENTRY_DSN empty — OK for local DEBUG; "
                        "set a Django project DSN on staging/prod."
                    )
                )
            else:
                warnings.append(
                    "SENTRY_DSN is empty while DEBUG=False — "
                    "production errors will not reach Sentry."
                )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "Backend Sentry init runs when DSN is set "
                    "(PII scrub in config.sentry)."
                )
            )

        if options["send_test_event"]:
            if not dsn:
                raise CommandError(
                    "Cannot send test event: SENTRY_DSN is empty. "
                    "Set it in the environment first."
                )
            import sentry_sdk

            event_id = sentry_sdk.capture_message(
                "3dam check_sentry_config test event",
                level="info",
            )
            sentry_sdk.flush(timeout=5.0)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Sent test event (id={event_id}). "
                    "Confirm it in the Sentry project Issues/Discover."
                )
            )

        if not warnings:
            if dsn:
                self.stdout.write(
                    self.style.SUCCESS("Sentry backend config looks ready for this env.")
                )
            return

        for warning in warnings:
            self.stdout.write(self.style.ERROR(warning))
        if options["fail_on_warnings"]:
            raise CommandError(
                f"Sentry config has {len(warnings)} issue(s). See messages above."
            )
