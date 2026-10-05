import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Review(models.Model):
    class ProductType(models.TextChoices):
        PRODUCT = "product", "Product"
        PLUGIN = "plugin", "Plugin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reviews",
    )
    product_type = models.CharField(max_length=16, choices=ProductType.choices)
    product_id = models.UUIDField(db_index=True)
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        null=True,
        blank=True,
    )
    review_text = models.TextField(max_length=2000, blank=True)
    is_hidden = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reviews"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["product_type", "product_id", "is_hidden"]),
            models.Index(fields=["user", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "product_type", "product_id"],
                name="unique_user_product_review",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.product_type}:{self.product_id}:{self.rating}"
