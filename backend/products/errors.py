"""Errors raised by the product services."""

from __future__ import annotations


class ProductError(Exception):
    def __init__(
        self,
        message: str,
        field: str | None = None,
        *,
        errors: dict[str, list[str]] | None = None,
    ) -> None:
        self.message = message
        self.field = field
        self.errors = errors
        super().__init__(message)
