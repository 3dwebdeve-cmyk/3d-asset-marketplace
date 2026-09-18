"""Legal document version acceptance — register + checkout proof."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import LegalAcceptance, User


class LegalAcceptanceError(Exception):
    def __init__(
        self,
        message: str,
        *,
        field: str = "accepted_legal",
        code: str = "legal_acceptance_required",
        missing: dict[str, str] | None = None,
    ) -> None:
        self.message = message
        self.field = field
        self.code = code
        self.missing = missing or {}
        super().__init__(message)


class LegalAcceptanceService:
    @staticmethod
    def current_versions() -> dict[str, str]:
        """Return configured document_key → version map (may be empty)."""
        raw = getattr(settings, "LEGAL_DOCUMENT_VERSIONS", None) or {}
        if not isinstance(raw, dict):
            return {}
        return {
            str(key).strip(): str(version).strip()
            for key, version in raw.items()
            if str(key).strip() and str(version).strip()
        }

    @classmethod
    def validate_offered(
        cls,
        offered: Any,
        *,
        require_all: bool = True,
    ) -> dict[str, str]:
        """Validate client ``accepted_legal`` against current required versions.

        When ``require_all`` is True (register), every current key must be present
        with the exact current version. Extra unknown keys are ignored.
        """
        required = cls.current_versions()
        if not required:
            return {}

        if not isinstance(offered, dict):
            raise LegalAcceptanceError(
                "Accepted legal document versions are required.",
                missing=required,
            )

        normalized: dict[str, str] = {}
        for key, version in offered.items():
            doc_key = str(key).strip()
            doc_version = str(version).strip() if version is not None else ""
            if doc_key and doc_version:
                normalized[doc_key] = doc_version

        missing: dict[str, str] = {}
        for key, version in required.items():
            if normalized.get(key) != version:
                missing[key] = version

        if missing:
            raise LegalAcceptanceError(
                "You must accept the current Terms and Privacy Policy versions.",
                missing=missing,
            )
        return {key: required[key] for key in required}

    @classmethod
    def missing_for_user(cls, user: User) -> dict[str, str]:
        required = cls.current_versions()
        if not required:
            return {}

        accepted = {
            row.document_key: row.version
            for row in LegalAcceptance.objects.filter(
                user=user,
                document_key__in=required.keys(),
            )
        }
        return {
            key: version
            for key, version in required.items()
            if accepted.get(key) != version
        }

    @classmethod
    @transaction.atomic
    def record_acceptances(cls, user: User, versions: dict[str, str]) -> None:
        """Persist acceptances (idempotent per user/document/version)."""
        if not versions:
            return
        now = timezone.now()
        for document_key, version in versions.items():
            LegalAcceptance.objects.get_or_create(
                user=user,
                document_key=document_key,
                version=version,
                defaults={"accepted_at": now},
            )

    @classmethod
    def ensure_current(
        cls,
        user: User,
        *,
        offered: Any = None,
    ) -> None:
        """Ensure the user has recorded all current legal versions.

        If rows are missing and ``offered`` matches current versions, record them.
        Otherwise raise ``LegalAcceptanceError``.
        """
        missing = cls.missing_for_user(user)
        if not missing:
            return

        if offered is None:
            raise LegalAcceptanceError(
                "You must accept the current Terms and Privacy Policy before checkout.",
                missing=missing,
            )

        validated = cls.validate_offered(offered, require_all=True)
        cls.record_acceptances(user, validated)
