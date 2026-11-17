import uuid

from django.core.validators import RegexValidator
from django.db import models
from django.utils.text import slugify

# The category part of a Model ID (ELE in ELE-000001), given once by the 3ds Max plugin.
CATEGORY_CODE_REGEX = r"^[A-Z]{2,5}$"


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    image = models.URLField(blank=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    is_active = models.BooleanField(default=True)
    # The Model ID code of this category's models; null until it is set. Codes never change.
    code = models.CharField(
        max_length=5,
        unique=True,
        null=True,
        blank=True,
        validators=[
            RegexValidator(
                regex=CATEGORY_CODE_REGEX,
                message="A code is 2 to 5 capital letters, for example ELE.",
            )
        ],
    )
    # Created by an upload and not approved yet; always saved with is_active=False.
    pending_approval = models.BooleanField(default=False)
    created_by_import = models.BooleanField(default=False)
    # The upload batch that created it (blank for a category made in /console).
    created_from_batch = models.CharField(max_length=128, blank=True, default="")
    # An admin rejected this pending category while it still had models. It stays hidden, its
    # models cannot be approved, and new uploads with its code are refused until an admin
    # approves it or merges it into another category. (An empty one is deleted instead.)
    rejected_at = models.DateTimeField(null=True, blank=True)
    click_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "categories"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["name"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["pending_approval"]),
            models.Index(fields=["-click_count", "name"]),
        ]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name

    @staticmethod
    def build_slug(name: str, *, exclude_id: uuid.UUID | None = None) -> str:
        base = slugify(name.strip()) or "category"
        slug = base
        counter = 1
        queryset = Category.objects.filter(slug=slug)
        if exclude_id is not None:
            queryset = queryset.exclude(pk=exclude_id)
        while queryset.exists():
            slug = f"{base}-{counter}"
            counter += 1
            queryset = Category.objects.filter(slug=slug)
            if exclude_id is not None:
                queryset = queryset.exclude(pk=exclude_id)
        return slug
