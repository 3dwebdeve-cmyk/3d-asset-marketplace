"""Shared DRF helpers for query parsing and domain-error responses.

Prefer these over copy-pasted ``_parse_uuid`` / ``_error_response`` helpers in
each app. Keep ``accounts.exceptions.custom_exception_handler`` as the primary
normalizer for DRF-raised exceptions; these helpers only format service-layer
domain errors that views catch explicitly.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response


def parse_uuid(value: str | None, field: str) -> UUID | None:
    """Parse an optional UUID query/body value; raise ValidationError if invalid."""
    if not value:
        return None
    try:
        return UUID(str(value).strip())
    except ValueError as exc:
        raise ValidationError({field: [f"Invalid {field}."]}) from exc


def parse_choice(value: str | None, field: str, allowed: set[str]) -> str | None:
    """Parse an optional lowercased choice filter against an allow-list."""
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized not in allowed:
        raise ValidationError({field: [f"Invalid {field} filter."]})
    return normalized


def domain_error_body(exc: Any, *, default_code: str) -> dict[str, Any]:
    """Build a UI-friendly error body from a marketplace domain exception.

    Recognized optional attributes (same shapes used across services):
    ``errors`` (full field map), ``field``, ``message``, ``code``, ``extra``.
    """
    errors = getattr(exc, "errors", None)
    if isinstance(errors, dict) and errors:
        return dict(errors)

    message = getattr(exc, "message", str(exc))
    field = getattr(exc, "field", None)
    code = getattr(exc, "code", None)
    extra = getattr(exc, "extra", None) or {}
    if not isinstance(extra, dict):
        extra = {}

    if field:
        body: dict[str, Any] = {field: [message]}
        if code:
            body["code"] = code
        body.update(extra)
        return body

    return {"detail": message, "code": code or default_code, **extra}


def domain_error_response(
    exc: Any,
    *,
    default_code: str,
    http_status: int = status.HTTP_400_BAD_REQUEST,
) -> Response:
    """Return a Response wrapping :func:`domain_error_body`."""
    return Response(
        domain_error_body(exc, default_code=default_code),
        status=http_status,
    )
