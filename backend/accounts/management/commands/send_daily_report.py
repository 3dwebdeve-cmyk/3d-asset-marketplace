"""Send (or with --dry-run, print) the daily health report now."""

from django.core.management.base import BaseCommand, CommandError

from config.ops_report import build_daily_report, report_recipients, send_daily_report


class Command(BaseCommand):
    help = (
        "Email the daily health report to OPS_REPORT_RECIPIENTS (or every active Administrator). "
        "The maintenance loop sends it every day; use this to test the email or read it now."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print the report instead of sending it.")

    def handle(self, *args, **options):
        if options["dry_run"]:
            report = build_daily_report()
            self.stdout.write(report.subject)
            self.stdout.write("")
            self.stdout.write(report.body)
            self.stdout.write(f"Would send to {len(report_recipients())} recipient(s).")
            return
        try:
            report = send_daily_report()
        except Exception as exc:
            raise CommandError(f"Could not send the daily report: {type(exc).__name__}") from exc
        self.stdout.write(f"Sent: {report.subject} ({len(report_recipients())} recipient(s)).")
