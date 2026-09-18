"""Report production secrets / hosts / TLS readiness (Phase A2)."""

from __future__ import annotations

from django.core import checks as django_checks
from django.core.management.base import BaseCommand, CommandError

from config.deploy_checks import collect_deploy_config_report


class Command(BaseCommand):
    help = (
        "Print secrets/hosts/TLS configuration used for staging and production. "
        "Pass --fail-on-warnings to exit non-zero when launch-blocking issues "
        "are detected. Pass --django-deploy-check to also run "
        "Django deployment system checks (same as manage.py check --deploy)."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when launch-blocking deploy issues are detected.",
        )
        parser.add_argument(
            "--django-deploy-check",
            action="store_true",
            help=(
                "Also run Django deployment system checks "
                "(includes custom Phase A2 security checks)."
            ),
        )

    def handle(self, *args, **options) -> None:
        report = collect_deploy_config_report()

        self.stdout.write(f"DEBUG={report.debug}")
        self.stdout.write(f"SECRET_KEY_length={report.secret_key_length}")
        self.stdout.write(f"SECRET_KEY_is_example={report.secret_key_is_example}")
        self.stdout.write(
            "ALLOWED_HOSTS="
            + (",".join(report.allowed_hosts) if report.allowed_hosts else "(empty)")
        )
        self.stdout.write(
            f"ALLOWED_HOSTS_wildcard={report.allowed_hosts_wildcard}"
        )
        self.stdout.write(
            f"ALLOWED_HOSTS_local_only={report.allowed_hosts_local_only}"
        )
        self.stdout.write(f"FRONTEND_BASE_URL={report.frontend_base_url}")
        self.stdout.write(f"FRONTEND_is_local={report.frontend_is_local}")
        self.stdout.write(f"CORS_ALLOWED_ORIGINS_count={report.cors_origins_count}")
        self.stdout.write(
            f"CORS_ALLOWED_ORIGINS_local_only={report.cors_origins_local_only}"
        )
        self.stdout.write(f"PUBLIC_API_BASE_URL={report.public_api_base_url}")
        self.stdout.write(f"PUBLIC_API_is_local={report.public_api_is_local}")
        self.stdout.write(
            f"CSRF_TRUSTED_ORIGINS_count={report.csrf_trusted_origins_count}"
        )
        self.stdout.write(f"SECURE_SSL_REDIRECT={report.secure_ssl_redirect}")
        self.stdout.write(f"SECURE_HSTS_SECONDS={report.secure_hsts_seconds}")
        self.stdout.write(f"DB_PASSWORD_weak={report.db_password_weak}")
        self.stdout.write(
            f"MEILI_MASTER_KEY_weak={report.meili_master_key_weak}"
        )
        self.stdout.write(f"REDIS_URL_set={report.redis_url_set}")
        self.stdout.write(
            "Confirm Postgres / Redis / Meilisearch / Gunicorn are NOT "
            "published on the public internet - only the SPA/proxy port "
            "(or Cloudflare tunnel). See docs/DEPLOY_SECRETS_STAGING_CHECKLIST.md."
        )

        if options.get("django_deploy_check"):
            self.stdout.write("")
            self.stdout.write("Running Django deployment system checks …")
            deploy_issues = django_checks.run_checks(include_deployment_checks=True)
            if deploy_issues:
                for issue in deploy_issues:
                    self.stdout.write(self.style.ERROR(str(issue)))
                raise CommandError(
                    f"Django check --deploy reported {len(deploy_issues)} issue(s). "
                    "Fix them, then re-run."
                )
            self.stdout.write(
                self.style.SUCCESS("Django check --deploy: no issues.")
            )

        if not report.warnings:
            self.stdout.write(
                self.style.SUCCESS(
                    "Deploy secrets/hosts/TLS config looks ready for this env."
                )
            )
            return

        for warning in report.warnings:
            self.stdout.write(self.style.ERROR(warning))
        if options["fail_on_warnings"]:
            raise CommandError(
                f"Deploy config has {len(report.warnings)} issue(s). "
                "See messages above and docs/DEPLOY_SECRETS_STAGING_CHECKLIST.md."
            )
        self.stdout.write(
            self.style.WARNING(
                f"{len(report.warnings)} issue(s) listed "
                "(re-run with --fail-on-warnings on staging/prod)."
            )
        )
