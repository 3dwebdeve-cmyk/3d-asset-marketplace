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

    def __str__(self) -> str:
        return f"{self.user_id}:{self.product_type}:{self.product_id}:{self.rating}"


class ReviewReply(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name="replies")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="review_replies")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, related_name="children", null=True, blank=True)
    text = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "review_replies"
        ordering = ["created_at"]


class ReviewReaction(models.Model):
    class Value(models.TextChoices):
        LIKE = "like", "Like"
        DISLIKE = "dislike", "Dislike"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="review_reactions")
    value = models.CharField(max_length=8, choices=Value.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "review_reactions"
        constraints = [models.UniqueConstraint(fields=["review", "user"], name="unique_review_user_reaction")]


class ReviewReplyReaction(models.Model):
    class Value(models.TextChoices):
        LIKE = "like", "Like"
        DISLIKE = "dislike", "Dislike"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reply = models.ForeignKey(ReviewReply, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_reply_reactions",
    )
    value = models.CharField(max_length=8, choices=Value.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "review_reply_reactions"
        constraints = [
            models.UniqueConstraint(fields=["reply", "user"], name="unique_review_reply_user_reaction")
        ]
