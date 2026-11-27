"""List the legal documents an email accepted, including for accounts that were deleted.

    python manage.py find_legal_acceptances --email someone@example.com
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from accounts.legal_service import acceptances_for_email


class Command(BaseCommand):
    help = "List Terms / Privacy acceptances for an email, from live or deleted accounts."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--email", required=True)

    def handle(self, *args: Any, **options: Any) -> None:
        rows = list(acceptances_for_email(options["email"]))
        if not rows:
            self.stdout.write("No acceptances found for that email.")
            return
        for row in rows:
            account = "live account" if row.user_id else "deleted account"
            self.stdout.write(
                f"{row.accepted_at.isoformat()}  {row.document_key} {row.version}  "
                f"user_ref={row.user_ref}  ({account})"
            )
