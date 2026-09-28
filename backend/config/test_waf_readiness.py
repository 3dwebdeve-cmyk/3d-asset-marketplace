"""Unit tests for Phase H3 Cloudflare WAF readiness."""

from __future__ import annotations

from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings

from config.waf_readiness import (
    REQUIRED_AUTH_THROTTLE_RATES,
    run_waf_readiness,
)


@override_settings(
    DEBUG=True,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "waf-readiness-tests",
        }
    },
)
class WafReadinessRunTests(SimpleTestCase):
    def test_readiness_passes_with_default_throttles(self) -> None:
        result = run_waf_readiness()
        by_name = {c.name: c for c in result.checks}
        self.assertTrue(by_name["auth_throttle_rates"].ok)
        self.assertTrue(by_name["auth_throttle_classes"].ok)
        self.assertTrue(by_name["shared_throttle_cache"].ok)
        self.assertTrue(result.all_ok)
        self.assertTrue(
            any("Cloudflare dashboard" in w for w in result.warnings)
        )

    def test_missing_auth_login_rate_fails(self) -> None:
        rates = {
            k: v
            for k, v in REQUIRED_AUTH_THROTTLE_RATES.items()
            if k != "auth_login"
        }
        with override_settings(
            REST_FRAMEWORK={
                "DEFAULT_THROTTLE_RATES": rates,
            }
        ):
            result = run_waf_readiness()
            rates_check = next(
                c for c in result.checks if c.name == "auth_throttle_rates"
            )
            self.assertFalse(rates_check.ok)
            self.assertIn("auth_login", rates_check.detail)
            self.assertFalse(result.all_ok)

    def test_command_prints_ok(self) -> None:
        out = StringIO()
        call_command("check_waf_readiness", stdout=out)
        text = out.getvalue()
        self.assertIn("waf_readiness OK", text)
        self.assertIn("[OK] auth_throttle_rates", text)
        self.assertIn("[OK] auth_throttle_classes", text)

    def test_fail_on_warnings_exits_when_debug_advisory(self) -> None:
        err = StringIO()
        with self.assertRaises(CommandError):
            call_command(
                "check_waf_readiness",
                fail_on_warnings=True,
                stdout=StringIO(),
                stderr=err,
            )


@override_settings(
    DEBUG=False,
    SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "marketplace_cache",
        }
    },
)
class WafReadinessProdLikeTests(SimpleTestCase):
    def test_prod_like_passes_core_checks(self) -> None:
        # Repo layout: backend/config/test_*.py → parents[2] = repo root
        nginx = Path(__file__).resolve().parents[2] / "frontend" / "nginx.conf"
        self.assertTrue(nginx.is_file(), msg=f"missing {nginx}")

        result = run_waf_readiness()
        by_name = {c.name: c for c in result.checks}
        self.assertTrue(by_name["auth_throttle_rates"].ok)
        self.assertTrue(by_name["auth_throttle_classes"].ok)
        self.assertTrue(by_name["shared_throttle_cache"].ok)
        self.assertTrue(by_name["ssl_proxy_header"].ok)
        self.assertTrue(
            by_name["nginx_cf_client_ip"].ok,
            by_name["nginx_cf_client_ip"].detail,
        )
        self.assertTrue(result.all_ok)

    def test_missing_ssl_proxy_header_fails(self) -> None:
        with override_settings(SECURE_PROXY_SSL_HEADER=None):
            result = run_waf_readiness()
            ssl = next(c for c in result.checks if c.name == "ssl_proxy_header")
            self.assertFalse(ssl.ok)

    def test_database_cache_ok_when_debug_false(self) -> None:
        result = run_waf_readiness()
        cache_check = next(
            c for c in result.checks if c.name == "shared_throttle_cache"
        )
        self.assertTrue(cache_check.ok)
        self.assertIn("DatabaseCache", cache_check.detail)

    def test_locmem_cache_fails_when_debug_false(self) -> None:
        with override_settings(
            CACHES={
                "default": {
                    "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                    "LOCATION": "waf-prod-locmem",
                }
            }
        ):
            result = run_waf_readiness()
        cache_check = next(
            c for c in result.checks if c.name == "shared_throttle_cache"
        )
        self.assertFalse(cache_check.ok)
        self.assertFalse(result.all_ok)

    def test_nginx_missing_cf_map_fails(self) -> None:
        fake = Path(__file__).resolve().parent / "_fake_nginx_no_cf.conf"
        fake.write_text("proxy_set_header X-Real-IP $remote_addr;\n", encoding="utf-8")
        try:
            with patch(
                "config.waf_readiness._nginx_conf_candidates",
                return_value=[fake],
            ):
                result = run_waf_readiness()
                nginx_check = next(
                    c for c in result.checks if c.name == "nginx_cf_client_ip"
                )
                self.assertFalse(nginx_check.ok)
        finally:
            fake.unlink(missing_ok=True)

    def test_nginx_trusting_raw_cf_header_fails(self) -> None:
        fake = Path(__file__).resolve().parent / "_fake_nginx_raw_cf.conf"
        fake.write_text(
            "map $http_cf_connecting_ip $real_client_ip {\n"
            "    default $http_cf_connecting_ip;\n"
            '    ""      $remote_addr;\n'
            "}\n"
            "proxy_set_header X-Real-IP $real_client_ip;\n",
            encoding="utf-8",
        )
        try:
            with patch(
                "config.waf_readiness._nginx_conf_candidates",
                return_value=[fake],
            ):
                result = run_waf_readiness()
                nginx_check = next(
                    c for c in result.checks if c.name == "nginx_cf_client_ip"
                )
                self.assertFalse(nginx_check.ok)
                self.assertIn("set_real_ip_from", nginx_check.detail)
        finally:
            fake.unlink(missing_ok=True)
