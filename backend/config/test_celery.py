"""Celery configuration and enqueue helper smoke tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings


class CelerySettingsTests(SimpleTestCase):
    def test_celery_runs_eager_under_test_runner(self) -> None:
        from django.conf import settings

        self.assertTrue(settings.CELERY_TASK_ALWAYS_EAGER)
        self.assertTrue(settings.CELERY_TASK_EAGER_PROPAGATES)
        self.assertTrue(settings.CELERY_TASK_IGNORE_RESULT)
        self.assertIn("json", settings.CELERY_ACCEPT_CONTENT)

    def test_email_tasks_routed_to_email_queue(self) -> None:
        from django.conf import settings

        self.assertEqual(
            settings.CELERY_TASK_ROUTES["orders.send_payment_receipt"]["queue"],
            "email",
        )
        self.assertEqual(
            settings.CELERY_TASK_ROUTES["accounts.send_email_verification"]["queue"],
            "email",
        )
        self.assertNotIn("search.sync_product", settings.CELERY_TASK_ROUTES)
        self.assertNotIn("search.sync_plugin", settings.CELERY_TASK_ROUTES)

    def test_mail_task_definitions_declare_email_queue(self) -> None:
        from accounts.tasks import (
            send_email_verification_task,
            send_password_changed_task,
            send_password_reset_task,
        )
        from contact.tasks import send_contact_submission_task
        from orders.tasks import send_payment_receipt_task

        for task in (
            send_email_verification_task,
            send_password_reset_task,
            send_password_changed_task,
            send_payment_receipt_task,
            send_contact_submission_task,
        ):
            self.assertEqual(task.queue, "email")

    def test_search_sync_tasks_use_default_queue(self) -> None:
        from search.tasks import sync_plugin_task, sync_product_task

        for task in (sync_product_task, sync_plugin_task):
            self.assertNotEqual(getattr(task, "queue", None), "email")

    def test_celery_app_loads(self) -> None:
        from config.celery import app

        self.assertEqual(app.main, "config")


class EnqueueAfterCommitTests(SimpleTestCase):
    @override_settings(CELERY_TASK_ALWAYS_EAGER=False)
    @patch("config.celery_utils.transaction.on_commit")
    def test_enqueue_registers_on_commit(self, mock_on_commit: MagicMock) -> None:
        from config.celery_utils import enqueue_after_commit

        task = MagicMock()
        task.name = "tests.dummy"
        task.delay = MagicMock()

        enqueue_after_commit(task, "arg1", kw="v")
        mock_on_commit.assert_called_once()
        callback = mock_on_commit.call_args[0][0]
        task.delay.assert_not_called()
        callback()
        task.delay.assert_called_once_with("arg1", kw="v")

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    @patch("config.celery_utils.transaction.on_commit")
    def test_eager_mode_enqueues_immediately(self, mock_on_commit: MagicMock) -> None:
        from config.celery_utils import enqueue_after_commit

        task = MagicMock()
        task.name = "tests.eager"
        task.delay = MagicMock()

        enqueue_after_commit(task, "x")
        mock_on_commit.assert_not_called()
        task.delay.assert_called_once_with("x")

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_enqueue_failure_is_swallowed(self) -> None:
        from config.celery_utils import enqueue_after_commit

        task = MagicMock()
        task.name = "tests.fail"
        task.delay = MagicMock(side_effect=RuntimeError("broker down"))

        # Must not raise to the caller (webhook / API safety).
        enqueue_after_commit(task, "x")


class PaymentReceiptTaskTests(SimpleTestCase):
    def test_task_skips_missing_order(self) -> None:
        from orders.tasks import send_payment_receipt_task

        with (
            patch("orders.tasks.Order.objects") as order_objects,
            patch("orders.notifications.deliver_payment_receipt") as deliver,
        ):
            from orders.models import Order

            order_objects.select_related.return_value.prefetch_related.return_value.get.side_effect = (
                Order.DoesNotExist
            )
            send_payment_receipt_task.run("00000000-0000-0000-0000-000000000001")
            deliver.assert_not_called()
