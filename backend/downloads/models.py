import uuid

from django.conf import settings
from django.db import models


class DownloadHistory(models.Model):
    class ProductType(models.TextChoices):
        PRODUCT = "product", "Product"
        PLUGIN = "plugin", "Plugin"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="download_history",
    )
    product_type = models.CharField(max_length=16, choices=ProductType.choices)
    product_id = models.UUIDField()
    file_id = models.UUIDField()
    file_name = models.CharField(max_length=255)
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="download_history",
    )
    downloaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "download_history"
        ordering = ["-downloaded_at"]
        indexes = [
            models.Index(fields=["user", "-downloaded_at"]),
            models.Index(fields=["product_type", "product_id"]),
            models.Index(fields=["downloaded_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.product_type}:{self.product_id} @ {self.downloaded_at}"
