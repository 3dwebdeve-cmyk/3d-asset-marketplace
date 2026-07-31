from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from django.db import transaction
from django.db.models import F, Q, QuerySet
from django.utils import timezone

from coupons.models import COUPON_CODE_REGEX, Coupon

INVALID_COUPON_MESSAGE = "Invalid or expired coupon code."
ZERO = Decimal("0.00")
CENT = Decimal("0.01")


class CouponError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


@dataclass(frozen=True)
class CouponCreateData:
    code: str
    discount_type: str
    discount_value: Decimal
    expiry_date: date | None = None
    active: bool = True
    max_uses: int | None = None
    max_uses_per_user: int | None = None


@dataclass(frozen=True)
class CouponUpdateData:
    code: str | None = None
    discount_type: str | None = None
    discount_value: Decimal | None = None
    expiry_date: date | None = None
    clear_expiry_date: bool = False
    active: bool | None = None
    max_uses: int | None = None
    clear_max_uses: bool = False
    max_uses_per_user: int | None = None
    clear_max_uses_per_user: bool = False


class CouponService:
    @classmethod
    def normalize_code(cls, code: str) -> str:
        return code.strip().upper()

    @classmethod
    def list_admin(
        cls,
        *,
        active: bool | None = None,
        discount_type: str | None = None,
        search: str | None = None,
        ordering: str | None = None,
    ) -> QuerySet[Coupon]:
        queryset = Coupon.objects.all()

        if active is not None:
            queryset = queryset.filter(active=active)
        if discount_type:
            queryset = queryset.filter(discount_type=discount_type)
        if search:
            query = search.strip()
            if query:
                queryset = queryset.filter(code__icontains=query.upper())

        allowed_ordering = {
            "code",
            "-code",
            "created_at",
            "-created_at",
            "expiry_date",
            "-expiry_date",
            "discount_value",
            "-discount_value",
            "times_used",
            "-times_used",
        }
        if ordering and ordering in allowed_ordering:
            return queryset.order_by(ordering)
        return queryset.order_by("-created_at")

    @classmethod
    def get_by_id(cls, coupon_id: UUID) -> Coupon:
        try:
            return Coupon.objects.get(pk=coupon_id)
        except Coupon.DoesNotExist as exc:
            raise CouponError("Coupon not found.") from exc

    @classmethod
    def get_by_code(cls, code: str) -> Coupon:
        normalized = cls.normalize_code(code)
        try:
            return Coupon.objects.get(code=normalized)
        except Coupon.DoesNotExist as exc:
            raise CouponError(INVALID_COUPON_MESSAGE, field="code") from exc

    @classmethod
    @transaction.atomic
    def create_coupon(cls, data: CouponCreateData) -> Coupon:
        code = cls._validate_code(data.code)
        discount_type, discount_value = cls._validate_discount(
            data.discount_type,
            data.discount_value,
        )
        max_uses = cls._validate_optional_positive(data.max_uses, field="max_uses")
        max_uses_per_user = cls._validate_optional_positive(
            data.max_uses_per_user,
            field="max_uses_per_user",
        )

        if Coupon.objects.filter(code=code).exists():
            raise CouponError("A coupon with this code already exists.", field="code")

        return Coupon.objects.create(
            code=code,
            discount_type=discount_type,
            discount_value=discount_value,
            expiry_date=data.expiry_date,
            active=data.active,
            max_uses=max_uses,
            max_uses_per_user=max_uses_per_user,
        )

    @classmethod
    @transaction.atomic
    def update_coupon(cls, coupon: Coupon, data: CouponUpdateData) -> Coupon:
        update_fields: list[str] = ["updated_at"]

        if data.code is not None:
            code = cls._validate_code(data.code)
            if Coupon.objects.filter(~Q(pk=coupon.pk), code=code).exists():
                raise CouponError(
                    "A coupon with this code already exists.",
                    field="code",
                )
            coupon.code = code
            update_fields.append("code")

        discount_type = (
            data.discount_type
            if data.discount_type is not None
            else coupon.discount_type
        )
        discount_value = (
            data.discount_value
            if data.discount_value is not None
            else coupon.discount_value
        )
        if data.discount_type is not None or data.discount_value is not None:
            discount_type, discount_value = cls._validate_discount(
                discount_type,
                discount_value,
            )
            coupon.discount_type = discount_type
            coupon.discount_value = discount_value
            update_fields.extend(["discount_type", "discount_value"])

        if data.clear_expiry_date:
            coupon.expiry_date = None
            update_fields.append("expiry_date")
        elif data.expiry_date is not None:
            coupon.expiry_date = data.expiry_date
            update_fields.append("expiry_date")

        if data.active is not None:
            coupon.active = data.active
            update_fields.append("active")

        if data.clear_max_uses:
            coupon.max_uses = None
            update_fields.append("max_uses")
        elif data.max_uses is not None:
            coupon.max_uses = cls._validate_optional_positive(
                data.max_uses,
                field="max_uses",
            )
            update_fields.append("max_uses")

        if data.clear_max_uses_per_user:
            coupon.max_uses_per_user = None
            update_fields.append("max_uses_per_user")
        elif data.max_uses_per_user is not None:
            coupon.max_uses_per_user = cls._validate_optional_positive(
                data.max_uses_per_user,
                field="max_uses_per_user",
            )
            update_fields.append("max_uses_per_user")

        coupon.save(update_fields=list(dict.fromkeys(update_fields)))
        return coupon

    @classmethod
    @transaction.atomic
    def deactivate_coupon(cls, coupon: Coupon) -> Coupon:
        coupon.active = False
        coupon.save(update_fields=["active", "updated_at"])
        return coupon

    @classmethod
    @transaction.atomic
    def delete_coupon(cls, coupon: Coupon) -> None:
        if coupon.times_used > 0:
            raise CouponError(
                "Cannot delete a coupon that has been used. Deactivate it instead.",
            )
        coupon.delete()

    @classmethod
    def is_expired(cls, coupon: Coupon, *, today: date | None = None) -> bool:
        if coupon.expiry_date is None:
            return False
        reference = today or timezone.now().date()
        return coupon.expiry_date < reference

    @classmethod
    def assert_redeemable(
        cls,
        coupon: Coupon,
        *,
        subtotal: Decimal,
        today: date | None = None,
    ) -> None:
        if not coupon.active or cls.is_expired(coupon, today=today):
            raise CouponError(INVALID_COUPON_MESSAGE, field="code")

        if coupon.max_uses is not None and coupon.times_used >= coupon.max_uses:
            raise CouponError(INVALID_COUPON_MESSAGE, field="code")

        if subtotal <= ZERO:
            raise CouponError(
                "Coupon cannot be applied to an empty cart.",
                field="code",
            )

    @classmethod
    def compute_discount(cls, subtotal: Decimal, coupon: Coupon) -> Decimal:
        if subtotal <= ZERO:
            return ZERO

        if coupon.discount_type == Coupon.DiscountType.PERCENT:
            raw = (subtotal * coupon.discount_value) / Decimal("100")
        else:
            raw = coupon.discount_value

        discount = min(raw, subtotal).quantize(CENT, rounding=ROUND_HALF_UP)
        if discount < ZERO:
            return ZERO
        return discount

    @classmethod
    def increment_usage(cls, coupon: Coupon) -> None:
        Coupon.objects.filter(pk=coupon.pk).update(times_used=F("times_used") + 1)

    @classmethod
    def serialize_applied(cls, coupon: Coupon) -> dict[str, Any]:
        return {
            "code": coupon.code,
            "discount_type": coupon.discount_type,
            "discount_value": f"{coupon.discount_value:.2f}",
        }

    @classmethod
    def _validate_code(cls, code: str) -> str:
        normalized = cls.normalize_code(code)
        if len(normalized) < 3:
            raise CouponError("Code must be at least 3 characters.", field="code")
        if len(normalized) > 32:
            raise CouponError("Code must be at most 32 characters.", field="code")
        if not COUPON_CODE_REGEX.fullmatch(normalized):
            raise CouponError(
                "Code may only contain uppercase letters, digits, hyphens, and underscores.",
                field="code",
            )
        return normalized

    @classmethod
    def _validate_discount(
        cls,
        discount_type: str,
        discount_value: Decimal,
    ) -> tuple[str, Decimal]:
        normalized_type = discount_type.strip().lower()
        if normalized_type not in Coupon.DiscountType.values:
            raise CouponError("Invalid discount type.", field="discount_type")

        value = Decimal(discount_value).quantize(CENT, rounding=ROUND_HALF_UP)
        if value < CENT:
            raise CouponError(
                "Discount value must be at least 0.01.",
                field="discount_value",
            )

        if normalized_type == Coupon.DiscountType.PERCENT and value > Decimal("100.00"):
            raise CouponError(
                "Percent discount cannot exceed 100.",
                field="discount_value",
            )

        return normalized_type, value

    @classmethod
    def _validate_optional_positive(
        cls,
        value: int | None,
        *,
        field: str,
    ) -> int | None:
        if value is None:
            return None
        if value < 1:
            raise CouponError(f"{field} must be at least 1.", field=field)
        return value
