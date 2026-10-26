"""API keys for the unattended catalog uploader (3ds Max pipeline exe).

A key belongs to a service user with the non-admin ``Catalog Uploader`` role. That
user is inactive and has no usable password, so it cannot sign in anywhere: password
login, Google sign-in and password reset all refuse inactive accounts. Keys work only
on ``POST /api/v1/catalog-ingest/import/``.

Key format: ``<prefix>.<secret>``. The prefix finds the row; only the SHA-256 hash of
the whole key is stored.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from accounts.models import CatalogApiKey, Role, User

CATALOG_UPLOADER_ROLE = "Catalog Uploader"
DEFAULT_SERVICE_EMAIL = "catalog-uploader@service.invalid"
_PREFIX_BYTES = 4  # 8 hex characters
_SECRET_BYTES = 32


class CatalogApiKeyError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class IssuedCatalogApiKey:
    api_key: CatalogApiKey
    # The plain key. Shown once; it cannot be recovered later.
    key: str


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def split_key(key: str) -> tuple[str, str] | None:
    prefix, sep, secret = key.partition(".")
    if not sep or not prefix or not secret:
        return None
    return prefix, secret


def is_catalog_uploader(user: User | None) -> bool:
    role = getattr(user, "role", None)
    return role is not None and role.role_name == CATALOG_UPLOADER_ROLE


class CatalogApiKeyService:
    @staticmethod
    def get_or_create_service_user(email: str = DEFAULT_SERVICE_EMAIL) -> User:
        normalized = User.objects.normalize_email(email.strip()).lower()
        role, _ = Role.objects.get_or_create(
            role_name=CATALOG_UPLOADER_ROLE,
            defaults={"description": "Service account for the catalog uploader API key"},
        )
        user = User.objects.select_related("role").filter(email=normalized).first()
        if user is not None:
            if not is_catalog_uploader(user):
                raise CatalogApiKeyError(
                    f"{normalized} belongs to a {user.role.role_name} account, "
                    "not a catalog uploader service account."
                )
            return user

        user = User(
            email=normalized,
            full_name="Catalog Uploader (service)",
            role=role,
            is_active=False,
            email_verified=False,
        )
        user.set_unusable_password()
        user.save()
        return user

    @classmethod
    @transaction.atomic
    def create_key(cls, *, name: str, service_email: str = DEFAULT_SERVICE_EMAIL) -> IssuedCatalogApiKey:
        name = name.strip()
        if not name:
            raise CatalogApiKeyError("A key name is required.")
        user = cls.get_or_create_service_user(service_email)
        prefix = secrets.token_hex(_PREFIX_BYTES)
        while CatalogApiKey.objects.filter(key_prefix=prefix).exists():
            prefix = secrets.token_hex(_PREFIX_BYTES)
        key = f"{prefix}.{secrets.token_urlsafe(_SECRET_BYTES)}"
        api_key = CatalogApiKey.objects.create(
            name=name[:100],
            key_prefix=prefix,
            key_hash=hash_key(key),
            user=user,
        )
        return IssuedCatalogApiKey(api_key=api_key, key=key)

    @staticmethod
    def verify(key: str) -> CatalogApiKey | None:
        """Return the active key matching ``key``, or None. Updates ``last_used_at``."""
        parts = split_key(key)
        if parts is None:
            return None
        candidate_hash = hash_key(key)
        api_key = (
            CatalogApiKey.objects.select_related("user", "user__role")
            .filter(key_prefix=parts[0])
            .first()
        )
        if api_key is None or not hmac.compare_digest(candidate_hash, api_key.key_hash):
            return None
        if not api_key.is_active or api_key.revoked_at is not None:
            return None
        if not is_catalog_uploader(api_key.user):
            return None
        now = timezone.now()
        CatalogApiKey.objects.filter(pk=api_key.pk).update(last_used_at=now)
        api_key.last_used_at = now
        return api_key

    @staticmethod
    def revoke(prefix: str) -> CatalogApiKey:
        api_key = CatalogApiKey.objects.filter(key_prefix=prefix.strip()).first()
        if api_key is None:
            raise CatalogApiKeyError(f"No API key with prefix {prefix.strip()}.")
        if api_key.revoked_at is None:
            api_key.revoked_at = timezone.now()
        api_key.is_active = False
        api_key.save(update_fields=["is_active", "revoked_at"])
        return api_key
