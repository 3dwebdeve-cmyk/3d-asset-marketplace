"""Daily health report emailed to the team (no Sentry or paid monitoring needed).

Built from what the database already records, for the last 24 hours. It never contains customer
names, email addresses or payment details: counts, totals and order invoice numbers only. Each
problem line names the section of docs/RUNBOOK.md that explains what to do.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
import logging
import json
import math
import re
from http.client import HTTPSConnection
from urllib.parse import urlencode

from django.conf import settings
from django.db.models import Count, Sum
from django.db import connection
from django.utils import timezone

logger = logging.getLogger(__name__)

EVENT_TYPE = "ops_daily_report"
WINDOW = timedelta(hours=24)


@dataclass
class DailyReport:
    lines: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def subject(self) -> str:
        if not self.problems:
            return "AssetHive3D daily report: all OK"
        count = len(self.problems)
        return f"AssetHive3D daily report: {count} problem{'s' if count != 1 else ''}"

    @property
    def body(self) -> str:
        parts = []
        if self.problems:
            parts.append("NEEDS ATTENTION")
            parts += [f"- {problem}" for problem in self.problems]
            parts.append("")
        parts += self.lines
        parts.append("")
        parts.append("What to do for each problem: docs/RUNBOOK.md in the repository.")
        return "\n".join(parts) + "\n"


def _money(totals: dict[str, Decimal]) -> str:
    if not totals:
        return "0"
    return ", ".join(f"{amount:.2f} {currency}" for currency, amount in sorted(totals.items()))


def _payments_section(report: DailyReport, since) -> None:
    from payments.models import CheckoutAttempt, Payment

    recent = Payment.objects.filter(updated_at__gte=since)
    by_status: dict[str, tuple[int, dict[str, Decimal]]] = {}
    rows = recent.values("status", "currency").annotate(count=Count("id"), total=Sum("amount"))
    for row in rows:
        count, totals = by_status.get(row["status"], (0, defaultdict(Decimal)))
        totals[row["currency"]] += row["total"] or Decimal("0")
        by_status[row["status"]] = (count + row["count"], totals)

    def line(status: str, label: str) -> int:
        count, totals = by_status.get(status, (0, {}))
        report.lines.append(f"  {label}: {count}" + (f" ({_money(totals)})" if count else ""))
        return count

    report.lines.append("Payments (last 24 hours)")
    line(Payment.Status.SUCCEEDED, "Paid")
    line(Payment.Status.REFUNDED, "Refunded")
    failed = line(Payment.Status.FAILED, "Failed card payments")
    disputed = line(Payment.Status.DISPUTED, "Disputed")
    if disputed:
        report.problems.append(
            f"{disputed} payment(s) disputed by the card holder. Respond in Stripe before the "
            "deadline (RUNBOOK: Disputes)."
        )
    if failed >= 5:
        report.problems.append(
            f"{failed} failed card payments in a day, possibly card testing (RUNBOOK: Payments)."
        )

    review = list(
        CheckoutAttempt.objects.filter(status=CheckoutAttempt.Status.REVIEW)
        .select_related("order")
        .order_by("created_at")
        .values_list("order__invoice_number", flat=True)[:10]
    )
    if review:
        report.problems.append(
            "Checkouts waiting for reconciliation: " + ", ".join(review)
            + " (RUNBOOK: Payments, an order is stuck)."
        )


def _email_section(report: DailyReport, since) -> None:
    from mail_log.models import BackgroundJob, OutboundEmailLog

    counts = dict(
        OutboundEmailLog.objects.filter(created_at__gte=since)
        .values_list("status")
        .annotate(count=Count("id"))
        .values_list("status", "count")
    )
    sent = counts.get(OutboundEmailLog.Status.SENT, 0)
    failed = counts.get(OutboundEmailLog.Status.FAILED, 0)
    report.lines.append("Emails (last 24 hours)")
    report.lines.append(f"  Sent: {sent}")
    report.lines.append(f"  Failed: {failed}")
    if failed:
        types = (
            OutboundEmailLog.objects.filter(created_at__gte=since, status=OutboundEmailLog.Status.FAILED)
            .values_list("event_type", flat=True)
            .distinct()
        )
        report.problems.append(
            f"{failed} email(s) could not be sent ({', '.join(sorted(types))}) "
            "(RUNBOOK: Emails do not arrive)."
        )

    now = timezone.now()
    exhausted = BackgroundJob.objects.filter(status="failed").count()
    stuck = BackgroundJob.objects.filter(
        status="queued",
        available_at__lte=now - timedelta(seconds=settings.BACKGROUND_JOBS_MAX_READY_AGE_SECONDS),
    ).count()
    if exhausted:
        report.problems.append(
            f"{exhausted} background job(s) gave up after all retries (RUNBOOK: Emails do not arrive)."
        )
    if stuck:
        report.problems.append(
            f"{stuck} background job(s) waiting too long: the job processor may be stopped "
            "(RUNBOOK: Emails do not arrive)."
        )


def _activity_section(report: DailyReport, since) -> None:
    from accounts.models import User
    from payments.models import StripeWebhookEvent
    from products.models import ProductPriceChange

    report.lines.append("Activity (last 24 hours)")
    report.lines.append(f"  New accounts: {User.objects.filter(created_at__gte=since).count()}")
    # Information only (the maintenance loop clearing ended sales), never a problem.
    sales_ended = ProductPriceChange.objects.filter(
        source=ProductPriceChange.Source.SALE_ENDED, created_at__gte=since
    ).count()
    report.lines.append(f"  Sales ended: {sales_ended}")
    last_webhook = StripeWebhookEvent.objects.order_by("-received_at").values_list("received_at", flat=True).first()
    report.lines.append(
        "  Last Stripe event received: "
        + (last_webhook.strftime("%Y-%m-%d %H:%M UTC") if last_webhook else "never")
    )


def _capacity_section(report: DailyReport, since) -> None:
    report.lines.append("Database usage (current database)")
    if connection.vendor != "postgresql":
        report.lines.append("  Database size: unavailable (PostgreSQL required)")
        return
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_database_size(current_database())")
            size = cursor.fetchone()[0]
        size_mb = size / (1024 * 1024)
        report.lines.append(f"  Database size: {size_mb:.2f} MiB")
        limit = settings.OPS_DB_WARNING_MB
        if limit > 0:
            report.lines.append(f"  Warning threshold: {limit} MiB")
            if size_mb >= limit:
                report.problems.append("Database size has reached its configured warning threshold.")
        else:
            report.lines.append("  Warning threshold: not configured")
    except Exception as exc:  # noqa: BLE001 - still send the rest of the report
        logger.warning("ops_database_size_failed error=%s", type(exc).__name__)
        report.lines.append("  Database size: unavailable")
        report.problems.append("Could not measure database size.")


def _render_metric(metric: str, api_key: str, service_id: str) -> list[str]:
    if metric not in {"cpu", "memory"}:
        raise ValueError("Unsupported Render metric")
    query = urlencode({"resource": service_id, "resolutionSeconds": 300})
    conn = HTTPSConnection("api.render.com", timeout=5)
    try:
        conn.request("GET", f"/v1/metrics/{metric}?{query}",
                     headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"})
        response = conn.getresponse()
        if response.status != 200:
            raise ValueError("Render metrics request failed")
        payload = json.loads(response.read(1_000_001))
    finally:
        conn.close()
    if not isinstance(payload, list):
        raise ValueError("Invalid metrics response")
    lines = []
    for series in payload[:20]:
        values = series.get("values", [])
        valid = [v for v in values if isinstance(v, dict) and isinstance(v.get("timestamp"), str)
                 and isinstance(v.get("value"), (int, float)) and math.isfinite(v["value"])]
        if not valid:
            continue
        latest = max(valid, key=lambda item: item["timestamp"])
        unit = str(series.get("unit", ""))[:30]
        if not re.fullmatch(r"[a-zA-Z0-9%/ ._-]*", unit):
            unit = ""
        lines.append(f"{latest['value']:g} {unit} (sample {latest['timestamp']})".strip())
    return lines


def _render_usage_section(report: DailyReport, since) -> None:
    report.lines.append("Render backend usage (latest available samples, per series)")
    key, service = settings.RENDER_METRICS_API_KEY, settings.RENDER_METRICS_SERVICE_ID
    if not key or not re.fullmatch(r"srv-[A-Za-z0-9]+", service):
        report.lines.append("  CPU and memory: unavailable (Render metrics key or service ID not configured)")
        return
    for metric, label in (("cpu", "CPU"), ("memory", "Memory")):
        try:
            samples = _render_metric(metric, key, service)
            if samples:
                for sample in samples:
                    report.lines.append(f"  {label}: {sample}")
            else:
                report.lines.append(f"  {label}: unavailable (no samples)")
        except Exception as exc:  # noqa: BLE001 - one unavailable metric must not stop the report
            logger.warning("render_metric_failed metric=%s error=%s", metric, type(exc).__name__)
            report.lines.append(f"  {label}: unavailable (check Render metrics access)")


def build_daily_report(task_results: dict[str, bool] | None = None) -> DailyReport:
    now = timezone.now()
    since = now - WINDOW
    report = DailyReport()
    report.lines.append(f"Report time: {now.strftime('%Y-%m-%d %H:%M UTC')}")
    report.lines.append("")

    if task_results is not None:
        report.lines.append("Daily maintenance")
        for name, ok in task_results.items():
            report.lines.append(f"  {name}: {'OK' if ok else 'FAILED'}")
            if not ok:
                report.problems.append(
                    f"Daily task {name} failed. Its error is in the Render log "
                    "(RUNBOOK: A daily task failed)."
                )
        report.lines.append("")

    for section in (_payments_section, _email_section, _activity_section, _capacity_section, _render_usage_section):
        try:
            section(report, since)
        except Exception as exc:  # noqa: BLE001 - one broken section must not stop the report
            logger.error("ops_report_section_failed section=%s error=%s", section.__name__, type(exc).__name__)
            report.problems.append(f"Could not build part of this report ({section.__name__.strip('_')}).")
        report.lines.append("")
    return report


def report_recipients() -> list[str]:
    raw = getattr(settings, "OPS_REPORT_RECIPIENTS", "") or ""
    recipients = [part.strip() for part in raw.split(",") if part.strip()]
    if recipients:
        return recipients
    from contact.services import ContactService

    return ContactService._active_administrator_emails()


def send_daily_report(task_results: dict[str, bool] | None = None) -> DailyReport:
    """Build and email the report. Raises when it cannot be sent, so the caller can log it."""
    from config.mail import send_text_mail
    from mail_log.services import MailLogService

    report = build_daily_report(task_results)
    recipients = report_recipients()
    if not recipients:
        logger.warning("ops_report_skipped reason=no_recipients")
        return report
    log_id = MailLogService.record_queued(
        event_type=EVENT_TYPE,
        recipients=recipients,
        related_object_type="ops",
        related_object_id="daily",
        subject=report.subject,
    )
    try:
        send_text_mail(subject=report.subject, body=report.body, recipients=recipients)
    except Exception as exc:
        MailLogService.mark_failed(log_id, str(exc))
        raise
    MailLogService.mark_sent(log_id)
    return report
