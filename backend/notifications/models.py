import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=200)
    message = models.CharField(max_length=500)
    link = models.CharField(max_length=500, blank=True, default="")
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read", "created_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.title}"
