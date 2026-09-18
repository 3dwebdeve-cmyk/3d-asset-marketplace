"""Idempotently create or promote a marketplace Administrator account."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import Role, User


class Command(BaseCommand):
    help = (
        "Ensure an Administrator exists for /console login. "
        "Creates a new admin or promotes an existing user. "
        "Example: python manage.py ensure_administrator "
        "--email ops@example.com --password '…' --full-name 'Ops Admin'"
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--email",
            required=True,
            help="Administrator email (also used for Django admin /console login).",
        )
        parser.add_argument(
            "--password",
            default="",
            help="Password for new users (required when creating). "
            "For existing users, omit to keep the current password.",
        )
        parser.add_argument(
            "--full-name",
            default="Administrator",
            help="Display name when creating a new user (default: Administrator).",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        email = str(options["email"]).strip().lower()
        password = str(options["password"] or "")
        full_name = str(options["full_name"] or "Administrator").strip() or "Administrator"
        if not email:
            raise CommandError("Email is required.")

        admin_role, _ = Role.objects.get_or_create(
            role_name="Administrator",
            defaults={"description": "Platform administrator"},
        )

        user = User.objects.filter(email__iexact=email).select_related("role").first()
        if user is None:
            if not password:
                raise CommandError(
                    "Password is required when creating a new administrator."
                )
            user = User.objects.create_user(
                email=email,
                full_name=full_name,
                password=password,
                role=admin_role,
                email_verified=True,
            )
            user.is_staff = True
            user.is_superuser = True
            user.save(
                update_fields=[
                    "is_staff",
                    "is_superuser",
                    "email_verified",
                    "updated_at",
                ]
            )
            self.stdout.write(
                self.style.SUCCESS(f"Created Administrator {email} (email_verified=True).")
            )
            return

        update_fields: list[str] = []
        if user.role_id != admin_role.pk:
            user.role = admin_role
            update_fields.append("role")
        if not user.email_verified:
            user.email_verified = True
            update_fields.append("email_verified")
        if not user.is_staff:
            user.is_staff = True
            update_fields.append("is_staff")
        if not user.is_superuser:
            user.is_superuser = True
            update_fields.append("is_superuser")
        if not user.is_active:
            user.is_active = True
            update_fields.append("is_active")
        if password:
            user.set_password(password)
            update_fields.append("password")
        if update_fields:
            update_fields.append("updated_at")
            user.save(update_fields=list(dict.fromkeys(update_fields)))
            self.stdout.write(
                self.style.SUCCESS(
                    f"Promoted/updated Administrator {email} "
                    f"({', '.join(f for f in update_fields if f != 'updated_at')})."
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(f"{email} is already an active Administrator.")
            )
