"""Phase 2 regression tests: lockout ceilings, seed guard and outbox payload purge."""

from io import StringIO
from unittest.mock import MagicMock, patch

from celery import current_app
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from accounts import login_guard
from accounts.models import Role, User
from mail_log.management.commands.process_background_jobs import process_one
from mail_log.models import BackgroundJob
from mail_log.services import redact_addresses
from products.management.commands.seed_e2e_commerce import DEFAULT_BUYER_EMAIL


@override_settings(LOGIN_LOCKOUT_MAX_FAILURES=3, LOGIN_LOCKOUT_ACCOUNT_MAX_FAILURES=6)
class AccountLockoutCeilingTests(TestCase):
    def setUp(self) -> None:
        cache.clear()

    def test_distributed_guessing_hits_the_account_ceiling(self) -> None:
        email = "victim@example.com"
        for index in range(6):
            login_guard.record_failure(email, f"203.0.113.{index}")

        # A brand-new IP is blocked once the account-wide ceiling is reached.
        self.assertTrue(login_guard.is_locked(email, "198.51.100.99"))

    def test_per_ip_lock_does_not_lock_out_other_clients_early(self) -> None:
        email = "owner@example.com"
        for _ in range(3):
            login_guard.record_failure(email, "203.0.113.7")

        self.assertTrue(login_guard.is_locked(email, "203.0.113.7"))
        self.assertFalse(login_guard.is_locked(email, "198.51.100.1"))

    def test_successful_login_clears_both_counters(self) -> None:
        email = "owner2@example.com"
        for _ in range(3):
            login_guard.record_failure(email, "203.0.113.8")
        login_guard.reset(email, "203.0.113.8")

        self.assertFalse(login_guard.is_locked(email, "203.0.113.8"))


class SeedCommandGuardTests(TestCase):
    @override_settings(DEPLOYMENT_PROFILE="production")
    def test_seed_refuses_to_run_in_production(self) -> None:
        with self.assertRaises(CommandError):
            call_command("seed_e2e_commerce", stdout=StringIO())

    @override_settings(DEPLOYMENT_PROFILE="test")
    def test_seed_refuses_to_overwrite_an_existing_custom_account(self) -> None:
        role = Role.objects.get(role_name="Customer")
        User.objects.create_user(
            email="real.customer@example.com",
            full_name="Real Customer",
            password="RealPass123!",
            role=role,
            email_verified=True,
        )
        with self.assertRaises(CommandError):
            call_command(
                "seed_e2e_commerce",
                "--email",
                "real.customer@example.com",
                stdout=StringIO(),
            )
        real = User.objects.get(email="real.customer@example.com")
        self.assertTrue(real.check_password("RealPass123!"))

    @override_settings(DEPLOYMENT_PROFILE="test")
    def test_seed_still_refreshes_the_fixed_fixture_accounts(self) -> None:
        call_command("seed_e2e_commerce", stdout=StringIO())
        call_command("seed_e2e_commerce", stdout=StringIO())
        self.assertEqual(User.objects.filter(email=DEFAULT_BUYER_EMAIL).count(), 1)


class OutboxPayloadPurgeTests(TestCase):
    def test_final_failure_removes_the_payload(self) -> None:
        task = MagicMock()
        task.name = "tests.final_failure"
        task.run.side_effect = RuntimeError("smtp down")
        job = BackgroundJob.objects.create(
            task_name=task.name,
            args=["reset-token-abc"],
            kwargs={"user_id": "1"},
            attempts=4,
        )

        with patch.dict(current_app.tasks, {task.name: task}):
            self.assertTrue(process_one())

        job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.args, [])
        self.assertEqual(job.kwargs, {})

    def test_retryable_failure_keeps_the_payload_for_the_next_attempt(self) -> None:
        task = MagicMock()
        task.name = "tests.retry_failure"
        task.run.side_effect = RuntimeError("smtp down")
        job = BackgroundJob.objects.create(
            task_name=task.name,
            args=["reset-token-xyz"],
            attempts=1,
        )

        with patch.dict(current_app.tasks, {task.name: task}):
            process_one()

        job.refresh_from_db()
        self.assertEqual(job.status, "queued")
        self.assertEqual(job.args, ["reset-token-xyz"])


class MailErrorRedactionTests(TestCase):
    def test_addresses_are_removed_from_provider_errors(self) -> None:
        text = "550 rejected: recipient bob.smith+tag@example.co.uk is unknown"
        self.assertNotIn("bob.smith", redact_addresses(text))
        self.assertIn("[redacted-email]", redact_addresses(text))
