"""Create the first administrator from environment variables (hosts without a shell).

Render's free plan has no shell, so ``ensure_administrator`` cannot be run by hand. The
container entrypoint runs this command when ``BOOTSTRAP_ADMIN_EMAIL`` and
``BOOTSTRAP_ADMIN_PASSWORD`` are set. It only ever *creates* an account:

- an existing administrator is left alone (the password is never reset from the environment);
- an existing non-administrator account with that email is refused, never promoted, because
  anyone could have registered that address as a customer first;
- the password must pass the site's password rules and be at least 12 characters.

Remove ``BOOTSTRAP_ADMIN_PASSWORD`` from the environment once the account exists. The
administrator then sets up the authenticator app at the first console sign-in.
"""

from __future__ import annotations

import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from accounts.services import AuthenticationService

MIN_LENGTH = 12


class Command(BaseCommand):
    help = "Create the first administrator from BOOTSTRAP_ADMIN_* environment variables."

    def handle(self, *args, **options):
        email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
        password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")
        full_name = os.environ.get("BOOTSTRAP_ADMIN_NAME", "").strip() or "Administrator"
        if not email or not password:
            self.stdout.write("Bootstrap administrator is not configured; nothing to do.")
            return

        existing = User.objects.filter(email__iexact=email).select_related("role").first()
        if existing is not None:
            if AuthenticationService.is_administrator(existing):
                self.stdout.write(
                    "The bootstrap administrator already exists; its password was not changed. "
                    "Remove BOOTSTRAP_ADMIN_PASSWORD from the environment."
                )
                return
            raise CommandError(
                "An account with the bootstrap email already exists and is not an administrator; "
                "refusing to promote it."
            )

        if len(password) < MIN_LENGTH:
            raise CommandError(f"The bootstrap password must be at least {MIN_LENGTH} characters.")
        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError("The bootstrap password was rejected: " + " ".join(exc.messages)) from exc

        call_command("ensure_administrator", email=email, password=password, full_name=full_name)
        self.stdout.write(
            "Created. Remove BOOTSTRAP_ADMIN_PASSWORD from the environment, then sign in at "
            "/console and set up the authenticator app."
        )
