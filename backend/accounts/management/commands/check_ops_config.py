"""Report ops readiness: Administrators, contact / project-message recipients."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User


def _parse_recipients(raw: str) -> list[str]:
    return [part.strip() for part in (raw or "").split(",") if part.strip()]


class Command(BaseCommand):
    help = (
        "Print staff/support routing used for contact forms and project messages. "
        "Pass --fail-on-warnings when DEBUG=False and recipients or admins are missing."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when launch-blocking ops issues are detected.",
        )

    def handle(self, *args, **options) -> None:
        contact = _parse_recipients(
            getattr(settings, "CONTACT_ADMIN_RECIPIENTS", "") or ""
        )
        project = _parse_recipients(
            getattr(settings, "PROJECT_MESSAGE_ADMIN_RECIPIENTS", "") or ""
        )
        admin_count = User.objects.filter(
            role__role_name="Administrator",
            is_active=True,
        ).count()
        warnings: list[str] = []

        self.stdout.write(f"DEBUG={settings.DEBUG}")
        self.stdout.write(f"active_administrators={admin_count}")
        self.stdout.write(f"CONTACT_ADMIN_RECIPIENTS_count={len(contact)}")
        self.stdout.write(
            f"PROJECT_MESSAGE_ADMIN_RECIPIENTS_count={len(project)}"
        )

        if admin_count < 1:
            warnings.append(
                "No active Administrator — run ensure_administrator "
                "or create staff via /console."
            )
        if not contact and not settings.DEBUG:
            warnings.append(
                "CONTACT_ADMIN_RECIPIENTS is empty while DEBUG=False — "
                "contact form mail may have nowhere to go."
            )
        if not project and not settings.DEBUG:
            warnings.append(
                "PROJECT_MESSAGE_ADMIN_RECIPIENTS is empty while DEBUG=False — "
                "project message alerts may miss staff inboxes."
            )

        if not warnings:
            self.stdout.write(
                self.style.SUCCESS("Ops staff/support config looks ready for this env.")
            )
            return

        for warning in warnings:
            self.stdout.write(self.style.ERROR(warning))
        if options["fail_on_warnings"]:
            raise CommandError(
                f"Ops config has {len(warnings)} issue(s). See messages above."
            )
