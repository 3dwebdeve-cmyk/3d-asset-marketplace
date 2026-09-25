"""Report email readiness: backend, Brevo/SMTP, recipients; optional test send."""

from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError


def _parse_recipients(raw: str) -> list[str]:
    return [part.strip() for part in (raw or "").split(",") if part.strip()]


class Command(BaseCommand):
    help = (
        "Print email configuration used by Django and Celery mail tasks. "
        "Pass --fail-on-warnings when DEBUG=False and console mail / missing "
        "Brevo or SMTP / recipients would block launch. Pass --send-test-email "
        "ADDR to deliver one smoke message through the configured backend."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when launch-blocking email issues are detected.",
        )
        parser.add_argument(
            "--send-test-email",
            metavar="ADDRESS",
            default="",
            help=(
                "Send a short smoke email to ADDRESS using the active EMAIL_BACKEND. "
                "Requires Brevo API, SMTP, or console to be configured."
            ),
        )

    def handle(self, *args, **options) -> None:
        backend = (getattr(settings, "EMAIL_BACKEND", "") or "").strip()
        allow_console = bool(getattr(settings, "ALLOW_CONSOLE_EMAIL", False))
        brevo_key = bool((getattr(settings, "BREVO_API_KEY", "") or "").strip())
        host = (getattr(settings, "EMAIL_HOST", "") or "").strip()
        port = getattr(settings, "EMAIL_PORT", 587)
        use_tls = bool(getattr(settings, "EMAIL_USE_TLS", True))
        user_set = bool((getattr(settings, "EMAIL_HOST_USER", "") or "").strip())
        password_set = bool(
            (getattr(settings, "EMAIL_HOST_PASSWORD", "") or "").strip()
        )
        from_email = (
            getattr(settings, "DEFAULT_FROM_EMAIL", "") or ""
        ).strip() or "(empty)"
        contact = _parse_recipients(
            getattr(settings, "CONTACT_ADMIN_RECIPIENTS", "") or ""
        )
        project = _parse_recipients(
            getattr(settings, "PROJECT_MESSAGE_ADMIN_RECIPIENTS", "") or ""
        )
        warnings: list[str] = []
        console = "console" in backend.lower()
        smtp = "smtp" in backend.lower() and "brevo" not in backend.lower()
        brevo = "brevo" in backend.lower()

        self.stdout.write(f"DEBUG={settings.DEBUG}")
        self.stdout.write(f"EMAIL_BACKEND={backend or '(empty)'}")
        self.stdout.write(f"ALLOW_CONSOLE_EMAIL={allow_console}")
        self.stdout.write(f"BREVO_API_KEY_set={brevo_key}")
        self.stdout.write(f"EMAIL_HOST_set={bool(host)}")
        self.stdout.write(f"EMAIL_PORT={port}")
        self.stdout.write(f"EMAIL_USE_TLS={use_tls}")
        self.stdout.write(f"EMAIL_HOST_USER_set={user_set}")
        self.stdout.write(f"EMAIL_HOST_PASSWORD_set={password_set}")
        self.stdout.write(f"DEFAULT_FROM_EMAIL={from_email}")
        self.stdout.write(f"CONTACT_ADMIN_RECIPIENTS_count={len(contact)}")
        self.stdout.write(
            f"PROJECT_MESSAGE_ADMIN_RECIPIENTS_count={len(project)}"
        )
        self.stdout.write(
            "Celery mail tasks require the same BREVO_API_KEY / EMAIL_* on web "
            "and worker - see backend/.env.example"
        )

        if console:
            if settings.DEBUG or allow_console:
                self.stdout.write(
                    self.style.WARNING(
                        "Console email backend active - OK for local DEBUG; "
                        "staging/prod must use BREVO_API_KEY or SMTP "
                        "(ALLOW_CONSOLE_EMAIL=False)."
                    )
                )
            else:
                warnings.append(
                    "EMAIL_BACKEND still uses console while DEBUG=False and "
                    "ALLOW_CONSOLE_EMAIL is False."
                )
        elif brevo:
            if not brevo_key:
                warnings.append(
                    "EMAIL_BACKEND is Brevo API but BREVO_API_KEY is empty - "
                    "mail cannot leave the host."
                )
            elif not warnings:
                self.stdout.write(
                    self.style.SUCCESS(
                        "Brevo API backend configured (BREVO_API_KEY set). "
                        "Confirm delivery with --send-test-email."
                    )
                )
        elif smtp:
            if not host:
                warnings.append(
                    "EMAIL_BACKEND is SMTP but EMAIL_HOST is empty - "
                    "mail cannot leave the host."
                )
            if not settings.DEBUG and not user_set:
                warnings.append(
                    "EMAIL_HOST_USER is empty while DEBUG=False - "
                    "most SMTP providers require authentication."
                )
            if not settings.DEBUG and not password_set:
                warnings.append(
                    "EMAIL_HOST_PASSWORD is empty while DEBUG=False - "
                    "most SMTP providers require authentication."
                )
            if not warnings:
                self.stdout.write(
                    self.style.SUCCESS(
                        "SMTP backend configured (host set). "
                        "Confirm delivery with --send-test-email. "
                        "Note: Render free blocks SMTP — prefer BREVO_API_KEY."
                    )
                )
        else:
            if not settings.DEBUG:
                warnings.append(
                    f"EMAIL_BACKEND={backend!r} is neither console, Brevo, nor SMTP. "
                    "Confirm this is intentional for staging/prod."
                )

        if not contact and not settings.DEBUG:
            warnings.append(
                "CONTACT_ADMIN_RECIPIENTS is empty while DEBUG=False - "
                "contact form mail may have nowhere to go."
            )
        if not project and not settings.DEBUG:
            warnings.append(
                "PROJECT_MESSAGE_ADMIN_RECIPIENTS is empty while DEBUG=False - "
                "project message alerts may miss staff inboxes."
            )

        to_addr = (options.get("send_test_email") or "").strip()
        if to_addr:
            subject = "3dam check_email_config test"
            body = (
                "This is a smoke message from manage.py check_email_config.\n"
                f"EMAIL_BACKEND={backend}\n"
                f"DEFAULT_FROM_EMAIL={from_email}\n"
            )
            try:
                sent = send_mail(
                    subject,
                    body,
                    None,  # use DEFAULT_FROM_EMAIL
                    [to_addr],
                    fail_silently=False,
                )
            except Exception as exc:  # noqa: BLE001 — surface provider errors to operator
                raise CommandError(
                    f"Failed to send test email to {to_addr}: {exc}"
                ) from exc
            if not sent:
                raise CommandError(
                    f"send_mail returned 0 for {to_addr} — check email settings."
                )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Sent test email to {to_addr}. "
                    "Confirm delivery in the inbox (or Brevo transactional logs)."
                )
            )

        if not warnings:
            if brevo and brevo_key:
                self.stdout.write(
                    self.style.SUCCESS(
                        "Email/Brevo config looks ready for this env."
                    )
                )
            elif smtp and host:
                self.stdout.write(
                    self.style.SUCCESS(
                        "Email/SMTP config looks ready for this env."
                    )
                )
            elif settings.DEBUG or allow_console:
                self.stdout.write(
                    self.style.SUCCESS(
                        "Email config OK for local/debug (console allowed)."
                    )
                )
            return

        for warning in warnings:
            self.stdout.write(self.style.ERROR(warning))
        if options["fail_on_warnings"]:
            raise CommandError(
                f"Email config has {len(warnings)} issue(s). See messages above."
            )
