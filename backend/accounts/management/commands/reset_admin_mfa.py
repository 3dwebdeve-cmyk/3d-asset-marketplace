"""Remove an administrator's two-factor sign-in after they lose their authenticator."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from accounts import mfa
from accounts.models import User
from accounts.security_log import log_admin_action
from accounts.services import AuthenticationService


class Command(BaseCommand):
    help = (
        "Reset an administrator's two-factor sign-in. They are signed out everywhere and "
        "set up a new authenticator at their next sign-in. Confirm who is asking first. "
        "Example: python manage.py reset_admin_mfa --email ops@example.com"
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--email", required=True, help="Administrator email.")

    def handle(self, *args, **options) -> None:
        email = str(options["email"]).strip().lower()
        user = User.objects.select_related("role").filter(email=email).first()
        if user is None or not AuthenticationService.is_administrator(user):
            raise CommandError(f"No active administrator with email {email}.")
        mfa.reset(user)
        log_admin_action(action="mfa_reset_by_operator", actor_id="manage.py", target_id=str(user.pk))
        self.stdout.write(
            self.style.SUCCESS(
                f"Two-factor sign-in reset for {email}. They will set it up at next sign-in."
            )
        )
