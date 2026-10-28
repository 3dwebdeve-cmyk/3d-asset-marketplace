"""Create, list and revoke API keys for the catalog uploader exe."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from accounts.api_keys import (
    DEFAULT_SERVICE_EMAIL,
    CatalogApiKeyError,
    CatalogApiKeyService,
)
from accounts.models import CatalogApiKey
from accounts.security_log import log_admin_action


class Command(BaseCommand):
    help = (
        "Manage catalog uploader API keys (POST /api/v1/catalog-ingest/import/). "
        "Examples: python manage.py catalog_api_key create --name office-pc | "
        "python manage.py catalog_api_key list | "
        "python manage.py catalog_api_key revoke --prefix 1a2b3c4d"
    )

    def add_arguments(self, parser) -> None:
        sub = parser.add_subparsers(dest="action", required=True)

        create = sub.add_parser("create", help="Create a key and print it once.")
        create.add_argument("--name", required=True, help="Where the key is used, e.g. office-pc.")
        create.add_argument(
            "--service-email",
            default=DEFAULT_SERVICE_EMAIL,
            help=f"Service user email (default {DEFAULT_SERVICE_EMAIL}).",
        )

        sub.add_parser("list", help="List keys: prefix, name, status, last used.")

        revoke = sub.add_parser("revoke", help="Revoke a key by its prefix.")
        revoke.add_argument("--prefix", required=True, help="Key prefix shown by list.")

    def handle(self, *args, **options) -> None:
        action = options["action"]
        try:
            if action == "create":
                self._create(options["name"], options["service_email"])
            elif action == "list":
                self._list()
            else:
                self._revoke(options["prefix"])
        except CatalogApiKeyError as exc:
            raise CommandError(exc.message) from exc

    def _create(self, name: str, service_email: str) -> None:
        issued = CatalogApiKeyService.create_key(name=name, service_email=service_email)
        api_key = issued.api_key
        log_admin_action(
            action="catalog_api_key_create",
            actor_id="manage.py",
            target_id=str(api_key.pk),
            metadata={"key_prefix": api_key.key_prefix, "name": api_key.name},
        )
        self.stdout.write(
            self.style.SUCCESS(f"Created key {api_key.key_prefix} ({api_key.name}).")
        )
        self.stdout.write("Copy it now; it is not stored and cannot be shown again:")
        self.stdout.write(issued.key)
        self.stdout.write("Send it as: Authorization: Api-Key <key>")

    def _list(self) -> None:
        keys = list(CatalogApiKey.objects.select_related("user").order_by("created_at"))
        if not keys:
            self.stdout.write("No catalog API keys.")
            return
        for api_key in keys:
            status = "active" if api_key.is_active and api_key.revoked_at is None else "revoked"
            last_used = api_key.last_used_at.isoformat() if api_key.last_used_at else "never"
            self.stdout.write(
                f"{api_key.key_prefix}  {status:<8}  last_used={last_used}  "
                f"name={api_key.name}  user={api_key.user.email}"
            )

    def _revoke(self, prefix: str) -> None:
        api_key = CatalogApiKeyService.revoke(prefix)
        log_admin_action(
            action="catalog_api_key_revoke",
            actor_id="manage.py",
            target_id=str(api_key.pk),
            metadata={"key_prefix": api_key.key_prefix, "name": api_key.name},
        )
        self.stdout.write(self.style.SUCCESS(f"Revoked key {api_key.key_prefix} ({api_key.name})."))
