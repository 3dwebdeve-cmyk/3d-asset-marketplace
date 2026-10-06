import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from orders.models import Order


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        EXPIRED = "expired", "Expired"
        REFUNDED = "refunded", "Refunded"
        DISPUTED = "disputed", "Disputed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(
        Order,
        on_delete=models.PROTECT,
        related_name="payment",
    )
    coupon = models.ForeignKey(
        "coupons.Coupon",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    gateway = models.CharField(max_length=32, default="stripe")
    stripe_checkout_session_id = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
    )
    stripe_payment_intent_id = models.CharField(
        max_length=255,
        blank=True,
        db_index=True,
    )
    checkout_url = models.TextField(blank=True, default="")
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="USD")
    refunded_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payments"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"payment:{self.order.invoice_number}"


class CheckoutAttempt(models.Model):
    """Committed before Stripe is called so retries reuse one operation key."""

    class Status(models.TextChoices):
        PREPARED = "prepared", "Prepared"
        READY = "ready", "Session ready"
        REVIEW = "review", "Needs reconciliation"
        EXPIRED = "expired", "Expired or superseded"

    order = models.OneToOneField(
        Order, on_delete=models.CASCADE, related_name="checkout_attempt",
    )
    idempotency_key = models.UUIDField(default=uuid.uuid4, unique=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PREPARED)
    stripe_checkout_session_id = models.CharField(max_length=255, null=True, blank=True, unique=True)
    checkout_url = models.TextField(blank=True, default="")
    request_payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "checkout_attempts"
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self) -> str:
        return f"checkout-attempt:{self.order_id}:{self.status}"


class StripeWebhookEvent(models.Model):
    """Idempotency record for processed Stripe webhook deliveries."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stripe_event_id = models.CharField(max_length=255, unique=True, db_index=True)
    event_type = models.CharField(max_length=100)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stripe_webhook_events"
        ordering = ["-received_at"]

    def __str__(self) -> str:
        return f"{self.event_type}:{self.stripe_event_id}"


class IdempotencyRecord(models.Model):
    """Durable successful HTTP responses; coordinated with PostgreSQL locks."""

    key = models.CharField(max_length=64, primary_key=True)
    body = models.JSONField()
    status_code = models.PositiveSmallIntegerField()
    expires_at = models.DateTimeField(db_index=True)
