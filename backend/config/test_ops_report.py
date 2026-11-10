"""The daily health report: what it counts, what it flags, and who receives it."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import MagicMock, patch

from django.core import mail
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from accounts.models import Role, User
from config.ops_report import DailyReport, _capacity_section, _render_metric, _render_usage_section, build_daily_report, send_daily_report
from mail_log.models import BackgroundJob, OutboundEmailLog
from orders.models import Order
from payments.models import CheckoutAttempt, Payment


class UsageReportTests(SimpleTestCase):
    @override_settings(OPS_DB_WARNING_MB=100)
    def test_database_size_and_warning(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = (101 * 1024 * 1024,)
        with patch("config.ops_report.connection") as db:
            db.vendor = "postgresql"
            db.cursor.return_value.__enter__.return_value = cursor
            report = DailyReport()
            _capacity_section(report, None)
        self.assertIn("Database size: 101.00 MiB", report.body)
        self.assertIn("reached its configured warning", report.body)

    @override_settings(RENDER_METRICS_API_KEY="", RENDER_METRICS_SERVICE_ID="")
    def test_unconfigured_render_metrics_are_explicit(self):
        report = DailyReport()
        _render_usage_section(report, None)
        self.assertIn("CPU and memory: unavailable", report.body)

    @override_settings(RENDER_METRICS_API_KEY="secret", RENDER_METRICS_SERVICE_ID="srv-example")
    def test_metric_failure_does_not_hide_other_metric(self):
        report = DailyReport()
        with patch("config.ops_report._render_metric", side_effect=[OSError(), ["300 MB (sample now)"]]):
            _render_usage_section(report, None)
        self.assertIn("CPU: unavailable", report.body)
        self.assertIn("Memory: 300 MB", report.body)
        self.assertNotIn("secret", report.body)

    def test_render_metric_reads_latest_sample(self):
        response = MagicMock()
        response.status = 200
        response.read.return_value = (
            b'[{"unit":"MB","values":[{"timestamp":"2026-01-01T00:00:00Z","value":5},'
            b'{"timestamp":"2026-01-01T00:05:00Z","value":9}]}]'
        )
        with patch("config.ops_report.HTTPSConnection") as factory:
            conn = factory.return_value
            conn.getresponse.return_value = response
            self.assertEqual(_render_metric("memory", "secret", "srv-example"),
                             ["9 MB (sample 2026-01-01T00:05:00Z)"])
        factory.assert_called_once_with("api.render.com", timeout=5)
        conn.close.assert_called_once()

    def test_render_metric_rejects_unknown_endpoint_and_redirects(self):
        with self.assertRaises(ValueError):
            _render_metric("../../unknown", "secret", "srv-example")
        with patch("config.ops_report.HTTPSConnection") as factory:
            conn = factory.return_value
            conn.getresponse.return_value.status = 302
            with self.assertRaises(ValueError):
                _render_metric("cpu", "secret", "srv-example")
            conn.close.assert_called_once()

    def test_memory_bytes_are_shown_in_mib(self):
        response = MagicMock(status=200)
        response.read.return_value = b'[{"unit":"bytes","values":[{"timestamp":"2026-01-01T00:00:00Z","value":10485760}]}]'
        with patch("config.ops_report.HTTPSConnection") as factory:
            factory.return_value.getresponse.return_value = response
            self.assertEqual(_render_metric("memory", "secret", "srv-example"),
                             ["10.00 MiB (sample 2026-01-01T00:00:00Z)"])

    def test_html_escapes_content_and_shows_tables(self):
        report = DailyReport(lines=["Report time: now", "", "Activity", "  Status: <unsafe>"],
                             problems=["Check <unsafe>"])
        self.assertIn("<table", report.html_body)
        self.assertIn("&lt;unsafe&gt;", report.html_body)
        self.assertNotIn("<unsafe>", report.html_body)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class DailyReportTests(TestCase):
    def setUp(self) -> None:
        self.customer = User.objects.create_user(
            email="report-customer@example.com",
            full_name="Report Customer",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Customer"),
        )
        self.orders = 0

    def payment(self, status: str, amount: str = "10.00", currency: str = "USD", *, days_ago: int = 0) -> Payment:
        self.orders += 1
        order = Order.objects.create(
            user=self.customer, invoice_number=f"INV-REPORT-{self.orders}", total_amount=Decimal(amount)
        )
        payment = Payment.objects.create(
            order=order,
            stripe_checkout_session_id=f"cs_test_report_{self.orders}",
            amount=Decimal(amount),
            currency=currency,
            status=status,
        )
        if days_ago:
            Payment.objects.filter(pk=payment.pk).update(updated_at=timezone.now() - timedelta(days=days_ago))
        return payment

    def test_quiet_day_is_all_ok(self) -> None:
        report = build_daily_report({"prune_expired_records": True})

        self.assertEqual(report.subject, "AssetHive3D daily report: all OK")
        self.assertNotIn("NEEDS ATTENTION", report.body)
        self.assertIn("prune_expired_records: OK", report.body)

    def test_counts_and_totals_only_the_last_day(self) -> None:
        self.payment(Payment.Status.SUCCEEDED, "10.00")
        self.payment(Payment.Status.SUCCEEDED, "5.50")
        self.payment(Payment.Status.SUCCEEDED, "7.00", "EUR")
        self.payment(Payment.Status.SUCCEEDED, "99.00", days_ago=3)
        self.payment(Payment.Status.REFUNDED, "4.00")

        body = build_daily_report().body

        self.assertIn("Paid: 3 (7.00 EUR, 15.50 USD)", body)
        self.assertIn("Refunded: 1 (4.00 USD)", body)
        self.assertIn("New accounts: 1", body)
        self.assertIn("Last Stripe event received: never", body)

    def test_flags_what_needs_a_person(self) -> None:
        self.payment(Payment.Status.DISPUTED)
        stuck = self.payment(Payment.Status.PENDING)
        CheckoutAttempt.objects.create(order=stuck.order, status=CheckoutAttempt.Status.REVIEW)
        OutboundEmailLog.objects.create(event_type="password_reset", status=OutboundEmailLog.Status.FAILED)
        BackgroundJob.objects.create(task_name="send_mail", status="failed")

        report = build_daily_report({"prune_expired_records": True, "check_payment_reconciliation": False})

        self.assertEqual(report.subject, "AssetHive3D daily report: 5 problems")
        body = report.body
        self.assertTrue(body.startswith("NEEDS ATTENTION"))
        self.assertIn("check_payment_reconciliation: FAILED", body)
        self.assertIn("1 payment(s) disputed", body)
        self.assertIn(stuck.order.invoice_number, body)
        self.assertIn("1 email(s) could not be sent (password_reset)", body)
        self.assertIn("1 background job(s) gave up", body)
        self.assertIn("docs/RUNBOOK.md", body)

    def test_failed_email_types_are_not_repeated(self) -> None:
        for _ in range(2):
            OutboundEmailLog.objects.create(event_type="admin_sign_in", status=OutboundEmailLog.Status.FAILED)
        self.assertIn("2 email(s) could not be sent (admin_sign_in)", build_daily_report().body)

    def test_many_failed_payments_look_like_card_testing(self) -> None:
        for _ in range(5):
            self.payment(Payment.Status.FAILED)

        self.assertIn("possibly card testing", build_daily_report().body)

    def test_never_contains_customer_details(self) -> None:
        self.payment(Payment.Status.DISPUTED)

        body = build_daily_report().body

        self.assertNotIn("report-customer@example.com", body)
        self.assertNotIn("Report Customer", body)
        self.assertNotIn("cs_test_report", body)

    @override_settings(OPS_REPORT_RECIPIENTS="ops@example.com, owner@example.com")
    def test_sends_to_the_configured_inboxes_and_logs_it(self) -> None:
        send_daily_report({"prune_expired_records": True})

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["ops@example.com", "owner@example.com"])
        self.assertEqual(mail.outbox[0].subject, "AssetHive3D daily report: all OK")
        self.assertIn("Payments (last 24 hours)", mail.outbox[0].body)
        html, mimetype = mail.outbox[0].alternatives[0]
        self.assertEqual(mimetype, "text/html")
        self.assertIn("<table", html)
        self.assertIn("Payments (last 24 hours)", html)
        self.assertTrue(
            OutboundEmailLog.objects.filter(event_type="ops_daily_report", status=OutboundEmailLog.Status.SENT).exists()
        )

    @override_settings(OPS_REPORT_RECIPIENTS="")
    def test_falls_back_to_active_administrators(self) -> None:
        User.objects.create_user(
            email="admin-report@example.com",
            full_name="Admin",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Administrator"),
        )

        send_daily_report()

        self.assertEqual(mail.outbox[0].to, ["admin-report@example.com"])

    @override_settings(OPS_REPORT_RECIPIENTS="ops@example.com")
    def test_command_dry_run_prints_without_sending(self) -> None:
        out = StringIO()
        call_command("send_daily_report", dry_run=True, stdout=out)

        self.assertIn("AssetHive3D daily report", out.getvalue())
        self.assertIn("Would send to 1 recipient(s).", out.getvalue())
        self.assertEqual(len(mail.outbox), 0)

        call_command("send_daily_report", stdout=StringIO())
        self.assertEqual(len(mail.outbox), 1)
