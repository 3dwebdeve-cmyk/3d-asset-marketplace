import re
import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Q

COUPON_CODE_REGEX = re.compile(r"^[A-Z0-9_-]+$")
COUPON_CODE_VALIDATOR = RegexValidator(
    regex=r"^[A-Z0-9_-]+$",
    message="Code may only contain uppercase letters, digits, hyphens, and underscores.",
)


class Coupon(models.Model):
    class DiscountType(models.TextChoices):
        PERCENT = "percent", "Percent"
        FIXED = "fixed", "Fixed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        validators=[COUPON_CODE_VALIDATOR],
    )
    discount_type = models.CharField(
        max_length=16,
        choices=DiscountType.choices,
    )
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
    active = models.BooleanField(default=True, db_index=True)
    max_uses = models.PositiveIntegerField(null=True, blank=True)
    max_uses_per_user = models.PositiveIntegerField(null=True, blank=True)
    times_used = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "coupons"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["active", "expiry_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(discount_value__gte=Decimal("0.01")),
                name="coupon_discount_value_positive",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(discount_type="percent")
                    | Q(discount_value__lte=Decimal("100.00"))
                ),
                name="coupon_percent_max_100",
            ),
            models.CheckConstraint(
                condition=Q(times_used__gte=0),
                name="coupon_times_used_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(max_uses__isnull=True) | Q(max_uses__gte=1),
                name="coupon_max_uses_positive_or_null",
            ),
            models.CheckConstraint(
                condition=Q(max_uses_per_user__isnull=True)
                | Q(max_uses_per_user__gte=1),
                name="coupon_max_uses_per_user_positive_or_null",
            ),
        ]

    def __str__(self) -> str:
        return self.code
