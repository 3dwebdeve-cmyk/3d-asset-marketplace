from __future__ import annotations

from uuid import UUID

from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.exceptions import ValidationError

from config.api_helpers import (
    domain_error_body,
    domain_error_response,
    parse_choice,
    parse_uuid,
)
from config.pagination import StandardPagination


class _SimpleDomainError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


class _RichDomainError(Exception):
    def __init__(
        self,
        message: str,
        field: str | None = None,
        *,
        code: str | None = None,
        extra: dict | None = None,
        errors: dict | None = None,
    ) -> None:
        self.message = message
        self.field = field
        self.code = code
        self.extra = extra or {}
        self.errors = errors
        super().__init__(message)


class ParseUuidTests(SimpleTestCase):
    def test_empty_returns_none(self) -> None:
        self.assertIsNone(parse_uuid(None, "product_id"))
        self.assertIsNone(parse_uuid("", "product_id"))

    def test_valid_uuid(self) -> None:
        raw = "550e8400-e29b-41d4-a716-446655440000"
        self.assertEqual(parse_uuid(raw, "product_id"), UUID(raw))

    def test_invalid_raises_validation_error(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            parse_uuid("not-a-uuid", "product_id")
        self.assertIn("product_id", ctx.exception.detail)


class ParseChoiceTests(SimpleTestCase):
    def test_none_returns_none(self) -> None:
        self.assertIsNone(parse_choice(None, "status", {"paid"}))

    def test_valid_normalized(self) -> None:
        self.assertEqual(parse_choice(" Paid ", "status", {"paid"}), "paid")

    def test_invalid_raises(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            parse_choice("nope", "status", {"paid"})
        self.assertIn("status", ctx.exception.detail)


class DomainErrorBodyTests(SimpleTestCase):
    def test_field_error(self) -> None:
        body = domain_error_body(
            _SimpleDomainError("bad", field="email"),
            default_code="order_error",
        )
        self.assertEqual(body, {"email": ["bad"]})

    def test_detail_with_default_code(self) -> None:
        body = domain_error_body(
            _SimpleDomainError("gone"),
            default_code="order_error",
        )
        self.assertEqual(body, {"detail": "gone", "code": "order_error"})

    def test_errors_map_wins(self) -> None:
        body = domain_error_body(
            _RichDomainError(
                "ignored",
                errors={"name": ["required"]},
            ),
            default_code="product_error",
        )
        self.assertEqual(body, {"name": ["required"]})

    def test_checkout_style_code_and_extra(self) -> None:
        body = domain_error_body(
            _RichDomainError(
                "verify first",
                field="email",
                code="email_not_verified",
                extra={"verify_path": "/verify"},
            ),
            default_code="checkout_error",
        )
        self.assertEqual(
            body,
            {
                "email": ["verify first"],
                "code": "email_not_verified",
                "verify_path": "/verify",
            },
        )

    def test_response_wrapper(self) -> None:
        response = domain_error_response(
            _SimpleDomainError("nope"),
            default_code="product_error",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data,
            {"detail": "nope", "code": "product_error"},
        )


class StandardPaginationTests(SimpleTestCase):
    def test_defaults(self) -> None:
        paginator = StandardPagination()
        self.assertEqual(paginator.page_size, 20)
        self.assertEqual(paginator.page_size_query_param, "page_size")
        self.assertEqual(paginator.max_page_size, 100)
