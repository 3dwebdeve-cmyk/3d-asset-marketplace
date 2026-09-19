"""Report auth readiness: FRONTEND_BASE_URL, Google OAuth, Administrator count."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from config.mail import (
    frontend_base_url,
    frontend_base_url_is_localhost,
    frontend_base_url_uses_https,
)


class Command(BaseCommand):
    help = (
        "Print auth/email link configuration used for verification and password reset. "
        "Pass --fail-on-warnings to exit non-zero when localhost FRONTEND is used "
        "with DEBUG=False, ALLOW_LOCALHOST_FRONTEND is True with DEBUG=False, "
        "non-HTTPS FRONTEND is used with DEBUG=False, or when no Administrator exists."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when launch-blocking auth issues are detected.",
        )

    def handle(self, *args, **options) -> None:
        base = frontend_base_url()
        google_set = bool(getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "").strip())
        admin_count = User.objects.filter(
            role__role_name="Administrator",
            is_active=True,
        ).count()
        localhost = frontend_base_url_is_localhost(base)
        allow_localhost = bool(getattr(settings, "ALLOW_LOCALHOST_FRONTEND", False))
        uses_https = frontend_base_url_uses_https(base)
        warnings: list[str] = []

        self.stdout.write(f"DEBUG={settings.DEBUG}")
        self.stdout.write(f"FRONTEND_BASE_URL={base}")
        self.stdout.write(f"ALLOW_LOCALHOST_FRONTEND={allow_localhost}")
        self.stdout.write(
            f"sample_verification_path={base}/verify-email/<uid>/<token>"
        )
        self.stdout.write(
            f"sample_password_reset_path={base}/reset-password/<uid>/<token>"
        )
        self.stdout.write(f"GOOGLE_OAUTH_CLIENT_ID_set={google_set}")
        self.stdout.write(f"active_administrators={admin_count}")

        if admin_count < 1:
            warnings.append(
                "No active Administrator — run: "
                "python manage.py ensure_administrator --email … --password …"
            )
        if not settings.DEBUG and localhost:
            warnings.append(
                "FRONTEND_BASE_URL points at localhost while DEBUG=False — "
                "verification emails will be unusable for real customers."
            )
        if not settings.DEBUG and allow_localhost:
            warnings.append(
                "ALLOW_LOCALHOST_FRONTEND is True while DEBUG=False — "
                "set False on staging/prod (local Compose escape hatch only)."
            )
        if not settings.DEBUG and not localhost and not uses_https:
            warnings.append(
                "FRONTEND_BASE_URL is not https while DEBUG=False — "
                "set https://<public-spa-origin> so verification links work on "
                "mobile + desktop over the public internet."
            )
        if not google_set:
            self.stdout.write(
                self.style.WARNING(
                    "Google sign-in disabled (GOOGLE_OAUTH_CLIENT_ID empty). "
                    "Optional unless you use Google login — then also set "
                    "frontend VITE_GOOGLE_CLIENT_ID to the same Web client ID."
                )
            )

        if not warnings:
            self.stdout.write(self.style.SUCCESS("Auth config looks ready for this env."))
            return

        for warning in warnings:
            self.stdout.write(self.style.ERROR(warning))
        if options["fail_on_warnings"]:
            raise CommandError(
                f"Auth config has {len(warnings)} issue(s). See messages above."
            )
