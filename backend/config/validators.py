"""Shared model validators."""

from django.core.exceptions import ValidationError


def validate_storage_path(value: str) -> None:
    """Reject path traversal in stored object keys or legacy media URLs."""
    if ".." in value.replace("\\", "/"):
        raise ValidationError("Invalid storage path.", code="invalid")
