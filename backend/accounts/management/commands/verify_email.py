from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from accounts.services import EmailVerificationService


class Command(BaseCommand):
    help = (
        "Mark a user's email as verified so they can sign in locally "
        "without SMTP. Example: python manage.py verify_email you@example.com"
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "email",
            type=str,
            help="Account email address to mark as verified.",
        )

    def handle(self, *args, **options) -> None:
        email = str(options["email"]).strip().lower()
        if not email:
            raise CommandError("Email is required.")

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f"No user found for {email}.")
        if not user.is_active:
            raise CommandError(f"User {email} is inactive.")

        if user.email_verified:
            self.stdout.write(self.style.WARNING(f"{email} is already verified."))
            return

        EmailVerificationService.mark_verified(user, action="command_mark_verified")
        self.stdout.write(self.style.SUCCESS(f"Marked {email} as email_verified."))
