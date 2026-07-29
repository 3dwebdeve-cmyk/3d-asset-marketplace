import uuid

from django.conf import settings
from django.db import models


class WishlistItem(models.Model):
    class ProductType(models.TextChoices):
        PRODUCT = "product", "Product"
        PLUGIN = "plugin", "Plugin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="wishlist_items",
    )
    product_type = models.CharField(max_length=16, choices=ProductType.choices)
    product_id = models.UUIDField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "wishlist_items"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["product_type", "product_id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "product_type", "product_id"],
                name="unique_user_wishlist_item",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.product_type}:{self.product_id}"
