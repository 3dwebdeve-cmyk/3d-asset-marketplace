"""Phase A2 — deploy secrets / hosts / TLS helpers and check_deploy_config."""

from __future__ import annotations

from io import StringIO

from django.core.checks import Error, Warning
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from config.deploy_checks import (
    allowed_hosts_are_local_only,
    allowed_hosts_has_wildcard,
    check_allowed_hosts_wildcard,
    check_csrf_trusted_origins_when_secure,
    check_example_secret_key,
    collect_deploy_config_report,
    db_password_is_weak,
    origin_host_is_local,
    secret_key_is_example,
)


class DeployCheckHelpersTests(SimpleTestCase):
    def test_secret_key_example_detection(self) -> None:
        self.assertTrue(
            secret_key_is_example(
                "change-me-to-a-long-random-string-at-least-32-bytes"
            )
        )
        self.assertFalse(
            secret_key_is_example("ci-test-secret-key-at-least-32-bytes-long!!")
        )

    def test_db_password_weak_detection(self) -> None:
        self.assertTrue(db_password_is_weak("change-me-db-password"))
        self.assertTrue(db_password_is_weak("short"))
        self.assertTrue(db_password_is_weak(""))
        self.assertFalse(db_password_is_weak("a-strong-unique-db-password"))

    def test_allowed_hosts_helpers(self) -> None:
        self.assertTrue(allowed_hosts_has_wildcard(["example.com", "*"]))
        self.assertFalse(allowed_hosts_has_wildcard(["example.com"]))
        self.assertTrue(
            allowed_hosts_are_local_only(["localhost", "web", "frontend"])
        )
        self.assertFalse(
            allowed_hosts_are_local_only(["localhost", "shop.example.com"])
        )

    def test_origin_host_is_local(self) -> None:
        self.assertTrue(origin_host_is_local("http://localhost:8080"))
        self.assertFalse(origin_host_is_local("https://shop.example.com"))


class DeploySystemChecksTests(SimpleTestCase):
    @override_settings(
        SECRET_KEY="change-me-to-a-long-random-string-at-least-32-bytes"
    )
    def test_example_secret_emits_deploy_error(self) -> None:
        errors = check_example_secret_key(None)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], Error)
        self.assertEqual(errors[0].id, "config.E001")

    @override_settings(SECRET_KEY="ci-test-secret-key-at-least-32-bytes-long!!")
    def test_unique_secret_passes(self) -> None:
        self.assertEqual(check_example_secret_key(None), [])

    @override_settings(ALLOWED_HOSTS=["*", "example.com"])
    def test_wildcard_hosts_emits_deploy_error(self) -> None:
        errors = check_allowed_hosts_wildcard(None)
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0].id, "config.E002")

    @override_settings(DEBUG=False, CSRF_TRUSTED_ORIGINS=[])
    def test_empty_csrf_emits_deploy_warning(self) -> None:
        warnings = check_csrf_trusted_origins_when_secure(None)
        self.assertEqual(len(warnings), 1)
        self.assertIsInstance(warnings[0], Warning)
        self.assertEqual(warnings[0].id, "config.W001")

    @override_settings(
        DEBUG=False,
        CSRF_TRUSTED_ORIGINS=["https://shop.example.com"],
    )
    def test_csrf_set_passes(self) -> None:
        self.assertEqual(check_csrf_trusted_origins_when_secure(None), [])


@override_settings(
    DEBUG=True,
    SECRET_KEY="local-dev-secret-key-at-least-32-bytes!!",
    ALLOWED_HOSTS=["localhost", "127.0.0.1"],
    FRONTEND_BASE_URL="http://localhost:5173",
    CORS_ALLOWED_ORIGINS=["http://localhost:5173"],
    PUBLIC_API_BASE_URL="http://127.0.0.1:8000",
    CSRF_TRUSTED_ORIGINS=[],
    REDIS_URL="",
    MEILI_MASTER_KEY="dev_master_key_change_me",
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
            "PASSWORD": "",
        }
    },
)
class CheckDeployConfigLocalTests(TestCase):
    def test_ok_for_debug_local(self) -> None:
        out = StringIO()
        call_command("check_deploy_config", fail_on_warnings=True, stdout=out)
        text = out.getvalue()
        self.assertIn("SECRET_KEY_is_example=False", text)
        self.assertIn("Deploy secrets/hosts/TLS config looks ready", text)


@override_settings(
    DEBUG=False,
    SECRET_KEY="change-me-to-a-long-random-string-at-least-32-bytes",
    ALLOWED_HOSTS=["localhost", "web", "frontend"],
    FRONTEND_BASE_URL="http://localhost:8080",
    CORS_ALLOWED_ORIGINS=["http://localhost:8080"],
    PUBLIC_API_BASE_URL="http://localhost:8080",
    CSRF_TRUSTED_ORIGINS=[],
    SECURE_SSL_REDIRECT=False,
    SECURE_HSTS_SECONDS=0,
    REDIS_URL="redis://redis:6379/1",
    MEILI_MASTER_KEY="change-me-meili-master-key-at-least-16-chars",
    ALLOW_LOCALHOST_FRONTEND=True,
    ALLOW_CONSOLE_EMAIL=True,
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
            "PASSWORD": "change-me-db-password",
        }
    },
)
class CheckDeployConfigProdGapsTests(TestCase):
    def test_fails_on_example_secrets_and_local_hosts(self) -> None:
        with self.assertRaises(CommandError):
            call_command("check_deploy_config", fail_on_warnings=True)

    def test_report_lists_expected_gaps(self) -> None:
        report = collect_deploy_config_report()
        self.assertTrue(report.secret_key_is_example)
        self.assertTrue(report.allowed_hosts_local_only)
        self.assertTrue(report.db_password_weak)
        self.assertTrue(report.meili_master_key_weak)
        self.assertTrue(report.allow_localhost_frontend)
        self.assertTrue(report.allow_console_email)
        self.assertGreaterEqual(len(report.warnings), 4)
        joined = " ".join(report.warnings)
        self.assertIn("REDIS_URL has no password", joined)
        self.assertIn("DJANGO_ADMIN", joined)


@override_settings(
    DEBUG=False,
    SECRET_KEY="staging-unique-secret-key-at-least-32-bytes!",
    ALLOWED_HOSTS=["shop.example.com"],
    FRONTEND_BASE_URL="https://shop.example.com",
    CORS_ALLOWED_ORIGINS=["https://shop.example.com"],
    PUBLIC_API_BASE_URL="https://shop.example.com",
    CSRF_TRUSTED_ORIGINS=["https://shop.example.com"],
    SECURE_SSL_REDIRECT=True,
    SECURE_HSTS_SECONDS=31536000,
    REDIS_URL="redis://:staging-redis-password@redis:6379/1",
    DJANGO_ADMIN_ENABLED=False,
    MEILI_MASTER_KEY="staging-meili-master-key-ok",
    ALLOW_LOCALHOST_FRONTEND=False,
    ALLOW_CONSOLE_EMAIL=False,
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
            "PASSWORD": "staging-strong-db-password",
        }
    },
)
class CheckDeployConfigReadyTests(TestCase):
    def test_ready_when_public_hosts_and_unique_secrets(self) -> None:
        out = StringIO()
        call_command("check_deploy_config", fail_on_warnings=True, stdout=out)
        text = out.getvalue()
        self.assertIn("SECRET_KEY_is_example=False", text)
        self.assertIn("ALLOWED_HOSTS_local_only=False", text)
        self.assertIn("CSRF_TRUSTED_ORIGINS_count=1", text)
        self.assertIn("ALLOW_LOCALHOST_FRONTEND=False", text)
        self.assertIn("ALLOW_CONSOLE_EMAIL=False", text)
        self.assertIn("Deploy secrets/hosts/TLS config looks ready", text)


@override_settings(
    DEBUG=False,
    SECRET_KEY="staging-unique-secret-key-at-least-32-bytes!",
    ALLOWED_HOSTS=["shop.example.com"],
    FRONTEND_BASE_URL="http://shop.example.com",
    CORS_ALLOWED_ORIGINS=["https://shop.example.com"],
    PUBLIC_API_BASE_URL="https://shop.example.com",
    CSRF_TRUSTED_ORIGINS=["https://shop.example.com"],
    SECURE_SSL_REDIRECT=True,
    SECURE_HSTS_SECONDS=31536000,
    REDIS_URL="redis://:staging-redis-password@redis:6379/1",
    DJANGO_ADMIN_ENABLED=False,
    MEILI_MASTER_KEY="staging-meili-master-key-ok",
    ALLOW_LOCALHOST_FRONTEND=False,
    ALLOW_CONSOLE_EMAIL=False,
    DATABASES={
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
            "PASSWORD": "staging-strong-db-password",
        }
    },
)
class CheckDeployConfigHttpFrontendTests(TestCase):
    def test_warns_when_public_frontend_is_http(self) -> None:
        report = collect_deploy_config_report()
        self.assertTrue(
            any("FRONTEND_BASE_URL is not https" in warning for warning in report.warnings)
        )
        with self.assertRaises(CommandError):
            call_command("check_deploy_config", fail_on_warnings=True)
