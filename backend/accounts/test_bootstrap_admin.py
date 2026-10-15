"""Creating the first administrator from the environment, and the daily maintenance loop."""

from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from accounts.management.commands import run_maintenance_loop
from accounts.models import Role, User
from accounts.services import AuthenticationService

STRONG = "Lantern-Harbor-Quartz-4821"
ENV = {
    "BOOTSTRAP_ADMIN_EMAIL": "Ops@Example.test",
    "BOOTSTRAP_ADMIN_PASSWORD": STRONG,
    "BOOTSTRAP_ADMIN_NAME": "Ops Admin",
}


def _run(env=None):
    out = StringIO()
    with patch.dict("os.environ", env if env is not None else ENV, clear=False), \
         patch("accounts.password_validation.BreachedPasswordValidator.validate", return_value=None):
        call_command("bootstrap_administrator", stdout=out)
    return out.getvalue()


@override_settings(PASSWORD_BREACH_CHECK=False)
class BootstrapAdministratorTests(TestCase):
    def setUp(self):
        self.customer_role = Role.objects.get(role_name="Customer")

    def test_creates_a_verified_administrator_with_the_given_password(self):
        _run()
        admin = User.objects.get(email="ops@example.test")
        self.assertTrue(AuthenticationService.is_administrator(admin))
        self.assertTrue(admin.email_verified)
        self.assertTrue(admin.check_password(STRONG))
        self.assertEqual(admin.full_name, "Ops Admin")

    def test_new_administrator_has_no_authenticator_yet(self):
        _run()
        from accounts import mfa

        self.assertFalse(mfa.is_enrolled(User.objects.get(email="ops@example.test")))

    def test_does_nothing_without_both_variables(self):
        for env in ({}, {"BOOTSTRAP_ADMIN_EMAIL": "ops@example.test"},
                    {"BOOTSTRAP_ADMIN_PASSWORD": STRONG}):
            with self.subTest(env=list(env)):
                with patch.dict("os.environ", {k: "" for k in ENV}, clear=False):
                    self.assertIn("not configured", _run(env))
        self.assertFalse(User.objects.filter(email="ops@example.test").exists())

    def test_never_resets_an_existing_administrators_password(self):
        _run()
        admin = User.objects.get(email="ops@example.test")
        admin.set_password("Different-Password-9917!")
        admin.save()
        output = _run({**ENV, "BOOTSTRAP_ADMIN_PASSWORD": "Another-Secret-Phrase-7734"})
        self.assertIn("already exists", output)
        admin.refresh_from_db()
        self.assertTrue(admin.check_password("Different-Password-9917!"))

    def test_refuses_to_promote_an_existing_customer(self):
        User.objects.create_user(
            email="ops@example.test", full_name="Someone", password="Customer-Pass-5512!",
            role=self.customer_role,
        )
        with self.assertRaisesMessage(CommandError, "refusing to promote"):
            _run()
        user = User.objects.get(email="ops@example.test")
        self.assertFalse(AuthenticationService.is_administrator(user))
        self.assertTrue(user.check_password("Customer-Pass-5512!"))

    def test_rejects_short_and_weak_passwords(self):
        for weak in ("Short-1!", "password1234", "123456789012"):
            with self.subTest(weak=weak):
                with self.assertRaises(CommandError):
                    _run({**ENV, "BOOTSTRAP_ADMIN_PASSWORD": weak})
        self.assertFalse(User.objects.filter(email="ops@example.test").exists())

    def test_the_password_is_never_printed(self):
        self.assertNotIn(STRONG, _run())


class MaintenanceLoopTests(SimpleTestCase):
    def test_runs_every_task_even_when_one_fails(self):
        called = []

        def fake(name, *args, **kwargs):
            called.append(name)
            if name == "manage_background_jobs":
                raise RuntimeError("boom with details")

        with patch.object(run_maintenance_loop, "call_command", side_effect=fake), \
             self.assertLogs(run_maintenance_loop.logger, level="ERROR") as logs:
            results = run_maintenance_loop.run_once()

        self.assertEqual(called, ["prune_expired_records", "manage_background_jobs", "check_payment_reconciliation"])
        self.assertEqual(results["manage_background_jobs"], False)
        self.assertTrue(results["prune_expired_records"])
        self.assertTrue(results["check_payment_reconciliation"])
        # Only the task name and exception type are logged, never the message.
        self.assertIn("task=manage_background_jobs error=RuntimeError", logs.output[0])
        self.assertNotIn("boom with details", logs.output[0])

    @override_settings(STRIPE_PAYMENT_MODE="test")
    def test_stripe_comparison_stays_off_for_a_test_account(self):
        names = [name for name, _, _ in run_maintenance_loop.maintenance_tasks()]
        self.assertNotIn("reconcile_stripe_payments", names)

    @override_settings(STRIPE_PAYMENT_MODE="live")
    def test_stripe_comparison_runs_for_a_live_account(self):
        names = [name for name, _, _ in run_maintenance_loop.maintenance_tasks()]
        self.assertIn("reconcile_stripe_payments", names)

    def test_once_runs_and_exits(self):
        with patch.object(run_maintenance_loop, "run_once") as run_once:
            call_command("run_maintenance_loop", "--once")
        run_once.assert_called_once()
