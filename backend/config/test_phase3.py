"""Production test-payment gating, retention, and operational checks."""

from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock, patch
import importlib.util
from pathlib import Path
import os

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from accounts.models import ActivityLog
from config.cutover_gate import _check_stripe
from mail_log.models import OutboundEmailLog
from payments.models import CheckoutAttempt, IdempotencyRecord


class PaymentModeGateTests(SimpleTestCase):
    @override_settings(
        STRIPE_PAYMENT_MODE="test", STRIPE_SECRET_KEY="sk_test_phase3",
        STRIPE_PUBLISHABLE_KEY="pk_test_phase3", STRIPE_WEBHOOK_SECRET="whsec_phase3",
        E2E_STRIPE_SIMULATE=False,
    )
    def test_production_security_profile_accepts_test_payments(self):
        result = _check_stripe("production")
        self.assertTrue(result.ok, result.detail)
        self.assertIn("payment_mode=test", result.detail)

    @override_settings(
        STRIPE_PAYMENT_MODE="test", STRIPE_SECRET_KEY="sk_live_wrong",
        STRIPE_PUBLISHABLE_KEY="pk_live_wrong", STRIPE_WEBHOOK_SECRET="whsec_phase3",
        E2E_STRIPE_SIMULATE=False,
    )
    def test_production_test_mode_rejects_live_keys(self):
        self.assertFalse(_check_stripe("production").ok)

    @override_settings(DEPLOYMENT_PROFILE="production")
    def test_runtime_role_gate_requires_distinct_roles(self):
        with patch.dict("os.environ", {"DB_RUNTIME_USER": "same", "DB_MIGRATION_USER": "same"}):
            with self.assertRaises(CommandError):
                call_command("check_db_runtime_role", stdout=StringIO())

    def test_object_backup_copy_verifies_every_object_without_network(self):
        path = Path(__file__).resolve().parents[1] / "scripts" / "object_backup_drill.py"
        spec = importlib.util.spec_from_file_location("object_backup_drill_phase3", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        s3 = MagicMock()
        s3.head_object.return_value = {"ContentLength": 12}
        with (
            patch.object(module, "client", return_value=s3),
            patch.object(module, "objects", return_value=[{"Key": "private/asset.zip", "Size": 12}]),
            patch("sys.argv", ["object_backup_drill.py", "backup", "--execute"]),
            patch.dict(os.environ, {
                "R2_PRIVATE_BUCKET": "source", "R2_BACKUP_BUCKET": "separate-backup",
            }),
        ):
            module.main()
        s3.copy_object.assert_called_once()
        s3.head_object.assert_called_once()

    def test_object_backup_refuses_the_app_key(self):
        path = Path(__file__).resolve().parents[1] / "scripts" / "object_backup_drill.py"
        spec = importlib.util.spec_from_file_location("object_backup_drill_keys", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for env in (
            {"R2_ACCESS_KEY_ID": "app-key", "R2_BACKUP_ACCESS_KEY_ID": "app-key",
             "R2_BACKUP_SECRET_ACCESS_KEY": "s"},
            {"R2_ACCESS_KEY_ID": "app-key"},
        ):
            with self.subTest(env=sorted(env)), patch.dict(os.environ, env, clear=True):
                with self.assertRaises(SystemExit):
                    module.backup_credentials()
        with patch.dict(os.environ, {"R2_ACCESS_KEY_ID": "app-key",
                                     "R2_BACKUP_ACCESS_KEY_ID": "backup-key",
                                     "R2_BACKUP_SECRET_ACCESS_KEY": "s"}, clear=True):
            self.assertEqual(module.backup_credentials(), ("backup-key", "s"))


class RetentionTests(TestCase):
    def test_cleanup_dry_run_then_deletes_only_expired_rows(self):
        past = timezone.now() - timedelta(days=400)
        future = timezone.now() + timedelta(days=1)
        Session.objects.create(session_key="phase3-old-session", session_data="", expire_date=past)
        Session.objects.create(session_key="phase3-new-session", session_data="", expire_date=future)
        IdempotencyRecord.objects.create(key="phase3-old", body={}, status_code=200, expires_at=past)
        IdempotencyRecord.objects.create(key="phase3-new", body={}, status_code=200, expires_at=future)
        log = ActivityLog.objects.create(action="phase3-test")
        ActivityLog.objects.filter(pk=log.pk).update(created_at=past)
        mail = OutboundEmailLog.objects.create(event_type="phase3-test")
        OutboundEmailLog.objects.filter(pk=mail.pk).update(created_at=past)
        cache.set("phase3-expired", 1, timeout=60)
        cache.set("phase3-live", 1, timeout=3600)
        cache_table = connection.ops.quote_name(settings.CACHES["default"]["LOCATION"])
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE {cache_table} SET expires = %s WHERE cache_key LIKE %s", [past, "%phase3-expired"]
            )
        call_command("prune_expired_records", stdout=StringIO())
        self.assertTrue(IdempotencyRecord.objects.filter(key="phase3-old").exists())
        call_command("prune_expired_records", execute=True, stdout=StringIO())
        self.assertFalse(IdempotencyRecord.objects.filter(key="phase3-old").exists())
        self.assertTrue(IdempotencyRecord.objects.filter(key="phase3-new").exists())
        self.assertFalse(Session.objects.filter(session_key="phase3-old-session").exists())
        self.assertTrue(Session.objects.filter(session_key="phase3-new-session").exists())
        self.assertFalse(ActivityLog.objects.filter(pk=log.pk).exists())
        self.assertFalse(OutboundEmailLog.objects.filter(pk=mail.pk).exists())
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT cache_key FROM {cache_table}")
            keys = [row[0] for row in cursor.fetchall()]
        self.assertFalse(any(key.endswith("phase3-expired") for key in keys))
        self.assertTrue(any(key.endswith("phase3-live") for key in keys))

    def test_unresolved_checkout_attempt_triggers_monitor(self):
        from accounts.models import Role, User
        from orders.models import Order

        role = Role.objects.get(role_name="Customer")
        user = User.objects.create_user(
            email="phase3-monitor@example.com", full_name="Monitor", password="Testing123!", role=role,
        )
        order = Order.objects.create(user=user, invoice_number="PHASE3-MONITOR", total_amount="1.00")
        attempt = CheckoutAttempt.objects.create(order=order, status=CheckoutAttempt.Status.REVIEW)
        CheckoutAttempt.objects.filter(pk=attempt.pk).update(created_at=timezone.now() - timedelta(minutes=11))
        with self.assertRaises(CommandError):
            call_command("check_payment_reconciliation", stdout=StringIO())

    @override_settings(MIN_DISK_FREE_MB=0, MAX_DB_SIZE_MB=0)
    def test_capacity_alerts_when_database_exceeds_limit(self):
        with self.assertRaises(CommandError):
            call_command("check_capacity", stdout=StringIO())
