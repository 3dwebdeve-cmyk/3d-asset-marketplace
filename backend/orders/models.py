import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Order(models.Model):
    class OrderStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    class PaymentStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="orders",
    )
    invoice_number = models.CharField(max_length=64, unique=True)
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="USD")
    order_status = models.CharField(
        max_length=32,
        choices=OrderStatus.choices,
        default=OrderStatus.PENDING,
        db_index=True,
    )
    payment_status = models.CharField(
        max_length=32,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "orders"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["order_status"]),
            models.Index(fields=["payment_status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self) -> str:
        return self.invoice_number


class OrderItem(models.Model):
    class ProductType(models.TextChoices):
        PRODUCT = "product", "Product"
        PLUGIN = "plugin", "Plugin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product_type = models.CharField(max_length=16, choices=ProductType.choices)
    product_id = models.UUIDField()
    title = models.CharField(max_length=255, blank=True, null=True)
    slug = models.SlugField(max_length=255, blank=True, null=True)
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
    )
    purchase_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "order_items"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["product_type", "product_id"]),
            models.Index(fields=["order", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "product_type", "product_id"],
                name="unique_order_line_item",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="order_item_quantity_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(purchase_price__gte=Decimal("0.00")),
                name="order_item_price_nonnegative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.product_type}:{self.product_id} x{self.quantity}"

    @property
    def line_total(self) -> Decimal:
        return self.purchase_price * self.quantity
