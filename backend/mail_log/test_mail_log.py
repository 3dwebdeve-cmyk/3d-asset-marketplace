"""Unit tests for outbound email log hashing and status transitions."""

from __future__ import annotations

from django.test import SimpleTestCase, TestCase

from mail_log.models import OutboundEmailLog
from mail_log.services import MailLogService, hash_recipients


class HashRecipientsTests(SimpleTestCase):
    def test_empty_recipients_returns_dash(self) -> None:
        self.assertEqual(hash_recipients([]), "-")
        self.assertEqual(hash_recipients(None), "-")

    def test_never_contains_cleartext_email(self) -> None:
        digest = hash_recipients(["Customer@Example.com"])
        self.assertTrue(digest.startswith("sha256:"))
        self.assertNotIn("customer", digest.lower())
        self.assertNotIn("@", digest)

    def test_order_independent(self) -> None:
        a = hash_recipients(["a@example.com", "b@example.com"])
        b = hash_recipients(["b@example.com", "a@example.com"])
        self.assertEqual(a, b)


class MailLogServiceTests(TestCase):
    def test_record_queued_mark_sent(self) -> None:
        log_id = MailLogService.record_queued(
            event_type="quotation_sent",
            recipients=["buyer@example.com"],
            related_object_type="custom_project",
            related_object_id="11111111-1111-1111-1111-111111111111",
            subject="Quotation ready",
        )
        self.assertIsNotNone(log_id)
        row = OutboundEmailLog.objects.get(pk=log_id)
        self.assertEqual(row.status, OutboundEmailLog.Status.QUEUED)
        self.assertTrue(row.recipient_hash.startswith("sha256:"))
        self.assertNotIn("@", row.recipient_hash)

        MailLogService.mark_sent(log_id)
        row.refresh_from_db()
        self.assertEqual(row.status, OutboundEmailLog.Status.SENT)

    def test_mark_failed_stores_error(self) -> None:
        log_id = MailLogService.record_queued(
            event_type="payment_receipt",
            recipients=["buyer@example.com"],
            related_object_type="order",
            related_object_id="22222222-2222-2222-2222-222222222222",
        )
        MailLogService.mark_failed(log_id, "SMTP connection refused")
        row = OutboundEmailLog.objects.get(pk=log_id)
        self.assertEqual(row.status, OutboundEmailLog.Status.FAILED)
        self.assertIn("SMTP", row.error)

    def test_record_skipped(self) -> None:
        log_id = MailLogService.record_skipped(
            event_type="quotation_sent",
            reason="no_customer_recipient",
            related_object_type="custom_project",
            related_object_id="33333333-3333-3333-3333-333333333333",
        )
        row = OutboundEmailLog.objects.get(pk=log_id)
        self.assertEqual(row.status, OutboundEmailLog.Status.SKIPPED)
        self.assertEqual(row.error, "no_customer_recipient")
