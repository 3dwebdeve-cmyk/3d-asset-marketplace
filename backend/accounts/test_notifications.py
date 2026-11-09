from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import AdminNotification, Role, User
from accounts.notifications import deliver_review_reminders
from categories.models import Category
from mail_log.models import BackgroundJob, OutboundEmailLog
from orders.models import Order
from payments.models import CheckoutAttempt, Payment
from products.models import Product


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    ADMIN_REVIEW_REMINDER_EMAIL="3dwebdeve@gmail.com", ADMIN_REVIEW_REMINDER_DAYS=3,
    FRONTEND_BASE_URL="https://assethive3d.com", BACKGROUND_JOBS_TEST_EAGER=False,
)
class AdminNotificationsTests(APITestCase):
    url = "/api/v1/admin/notifications/"

    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(email="notices-admin@example.com", password="TestPass123!",
            full_name="Admin", role=Role.objects.get(role_name="Administrator"))
        self.other = User.objects.create_user(email="notices-other@example.com", password="TestPass123!",
            full_name="Other Admin", role=self.admin.role)
        self.customer = User.objects.create_user(email="notices-customer@example.com", password="TestPass123!",
            full_name="Customer", role=Role.objects.get(role_name="Customer"))
        self.category = Category.objects.create(name="Furniture", slug="notices-furniture")
        self.product = Product.objects.create(category=self.category, name="Oak Chair", slug="oak-chair", price=10, status="pending_review")
        self.notice = AdminNotification.objects.get(product=self.product, resolved_at=None)

    def overdue(self, notice=None):
        notice = notice or self.notice
        AdminNotification.objects.filter(pk=notice.pk).update(created_at=timezone.now() - timedelta(days=4))

    def test_only_administrators_can_list_or_mark_read(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url, {"all": True}, format="json").status_code, 403)

    def test_unread_state_is_independent_per_administrator(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual(response.data["results"][0]["path"], f"/console/products/{self.product.pk}")
        self.assertEqual(self.client.post(self.url, {"id": str(self.notice.pk)}, format="json").status_code, 200)
        self.assertEqual(self.client.get(self.url).data["unread_count"], 0)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).data["unread_count"], 1)
        self.assertEqual(self.client.post(self.url, {"all": True}, format="json").status_code, 200)
        self.assertEqual(self.client.get(self.url).data["unread_count"], 0)

    def test_invalid_mark_read_and_latest_results_limit(self):
        self.client.force_authenticate(self.admin)
        for payload in ({}, {"id": "bad"}, {"id": str(self.notice.pk), "all": True}):
            self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 400)
        for index in range(35):
            AdminNotification.objects.create(event_key=f"extra:{index}", kind="paid_order", title="Order", path="/console/orders")
        response = self.client.get(self.url)
        self.assertEqual(len(response.data["results"]), 30)
        self.assertEqual(response.data["unread_count"], 36)
        self.client.post(self.url, {"all": True}, format="json")
        self.assertEqual(self.client.get(self.url).data["unread_count"], 0)

    def test_repeat_saves_are_deduplicated_and_new_review_resets_reminder(self):
        self.product.save()
        self.assertEqual(AdminNotification.objects.filter(product=self.product).count(), 1)
        self.product.status = "rejected"
        self.product.save()
        self.notice.refresh_from_db()
        self.assertIsNotNone(self.notice.resolved_at)
        self.product.status = "pending_review"
        self.product.save()
        self.assertEqual(AdminNotification.objects.filter(product=self.product).count(), 2)
        current = AdminNotification.objects.get(product=self.product, resolved_at=None)
        self.assertIsNone(current.reminder_sent_at)
        self.assertNotEqual(current.pk, self.notice.pk)

    def test_paid_order_and_payment_events_are_deduplicated(self):
        order = Order.objects.create(user=self.customer, invoice_number="INV-NOTICE-1", total_amount=10,
                                     order_status="paid", payment_status="paid")
        order.save()
        payment = Payment.objects.create(order=order, amount=10, stripe_checkout_session_id="cs_notice", status="disputed")
        payment.save()
        attempt = CheckoutAttempt.objects.create(order=order, status="review")
        attempt.save()
        self.assertEqual(AdminNotification.objects.filter(kind="paid_order").count(), 1)
        self.assertEqual(AdminNotification.objects.filter(kind="payment_issue").count(), 2)

    def test_reminder_goes_to_approved_inbox_once_even_if_already_read(self):
        self.overdue()
        self.notice.read_by.add(self.admin)
        deliver_review_reminders([str(self.notice.pk)])
        deliver_review_reminders([str(self.notice.pk)])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["3dwebdeve@gmail.com"])
        self.assertIn(f"https://assethive3d.com/console/products/{self.product.pk}", mail.outbox[0].body)
        self.notice.refresh_from_db()
        self.assertIsNotNone(self.notice.reminder_sent_at)

    def test_fresh_approved_and_rejected_models_are_not_emailed(self):
        deliver_review_reminders([str(self.notice.pk)])
        self.assertEqual(len(mail.outbox), 0)
        self.overdue()
        for status in ("published", "rejected"):
            # Also guard bulk updates which don't emit model save signals.
            Product.objects.filter(pk=self.product.pk).update(status=status)
            deliver_review_reminders([str(self.notice.pk)])
        self.assertEqual(len(mail.outbox), 0)

    def test_failure_is_retryable_and_successful_digest_marks_every_model(self):
        self.overdue()
        second = Product.objects.create(category=self.category, name="Desk", slug="desk", price=10, status="pending_review")
        other_notice = AdminNotification.objects.get(product=second)
        self.overdue(other_notice)
        ids = [str(self.notice.pk), str(other_notice.pk)]
        with patch("accounts.notifications.send_text_mail", side_effect=OSError("provider down")):
            with self.assertRaises(OSError):
                deliver_review_reminders(ids)
        self.assertEqual(AdminNotification.objects.filter(reminder_sent_at__isnull=False).count(), 0)
        self.assertTrue(OutboundEmailLog.objects.filter(event_type="model_review_reminder", status="failed").exists())
        deliver_review_reminders(ids)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Oak Chair", mail.outbox[0].body)
        self.assertIn("Desk", mail.outbox[0].body)
        self.assertEqual(AdminNotification.objects.filter(reminder_sent_at__isnull=False).count(), 2)

    def test_scheduler_queues_durable_job_and_worker_rechecks_review_status(self):
        self.overdue()
        call_command("send_review_reminders")
        job = BackgroundJob.objects.get(task_name="accounts.send_review_reminders")
        self.assertEqual(job.args, [[str(self.notice.pk)]])
        self.product.status = "rejected"
        self.product.save()
        from mail_log.management.commands.process_background_jobs import process_one
        self.assertTrue(process_one())
        self.assertFalse(BackgroundJob.objects.filter(pk=job.pk).exists())
        self.assertEqual(len(mail.outbox), 0)
