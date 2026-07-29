import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

CART_ITEM_MAX_QUANTITY = 99


class Cart(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cart",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "carts"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"cart:{self.user_id}"


class CartItem(models.Model):
    MAX_QUANTITY = CART_ITEM_MAX_QUANTITY

    class ProductType(models.TextChoices):
        PRODUCT = "product", "Product"
        PLUGIN = "plugin", "Plugin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product_type = models.CharField(max_length=16, choices=ProductType.choices)
    product_id = models.UUIDField(db_index=True)
    quantity = models.PositiveIntegerField(
        validators=[
            MinValueValidator(1),
            MaxValueValidator(CART_ITEM_MAX_QUANTITY),
        ],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cart_items"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["cart", "created_at"]),
            models.Index(fields=["product_type", "product_id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["cart", "product_type", "product_id"],
                name="unique_cart_line_item",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1),
                name="cart_item_quantity_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__lte=CART_ITEM_MAX_QUANTITY),
                name="cart_item_quantity_max",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.product_type}:{self.product_id} x{self.quantity}"
