import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.text import slugify


class Product(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class LicenseType(models.TextChoices):
        STANDARD = "standard", "Standard"
        EXTENDED = "extended", "Extended"
        EDITORIAL = "editorial", "Editorial"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        "categories.Category",
        on_delete=models.PROTECT,
        related_name="products",
    )
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    short_description = models.CharField(max_length=500, blank=True)
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="USD")
    discount_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    thumbnail = models.URLField(blank=True)
    preview_model = models.URLField(blank=True)
    preview_video = models.URLField(blank=True)
    polygon_count = models.PositiveIntegerField(null=True, blank=True)
    vertex_count = models.PositiveIntegerField(null=True, blank=True)
    software_used = models.CharField(max_length=255, blank=True)
    animated = models.BooleanField(default=False)
    rigged = models.BooleanField(default=False)
    pbr_ready = models.BooleanField(default=False)
    game_ready = models.BooleanField(default=False)
    license_type = models.CharField(
        max_length=32,
        choices=LicenseType.choices,
        default=LicenseType.STANDARD,
    )
    average_rating = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    total_downloads = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "products"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["name"]),
            models.Index(fields=["status"]),
            models.Index(fields=["category", "status"]),
            models.Index(fields=["price"]),
        ]

    def __str__(self) -> str:
        return self.name

    @staticmethod
    def build_slug(name: str, *, exclude_id: uuid.UUID | None = None) -> str:
        base = slugify(name.strip()) or "product"
        slug = base
        counter = 1
        queryset = Product.objects.filter(slug=slug)
        if exclude_id is not None:
            queryset = queryset.exclude(pk=exclude_id)
        while queryset.exists():
            slug = f"{base}-{counter}"
            counter += 1
            queryset = Product.objects.filter(slug=slug)
            if exclude_id is not None:
                queryset = queryset.exclude(pk=exclude_id)
        return slug


class ProductImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="images",
    )
    image_url = models.URLField()
    display_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_images"
        ordering = ["display_order", "created_at"]
        indexes = [
            models.Index(fields=["product", "display_order"]),
            models.Index(fields=["product", "is_primary"]),
        ]

    def __str__(self) -> str:
        return f"{self.product.name} image {self.display_order}"


class ProductFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="files",
    )
    file_name = models.CharField(max_length=255)
    file_format = models.CharField(max_length=32)
    file_size = models.PositiveBigIntegerField()
    storage_path = models.URLField()
    version = models.CharField(max_length=64, default="1.0")
    is_preview = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_files"
        ordering = ["-is_preview", "file_format", "created_at"]
        indexes = [
            models.Index(fields=["product", "is_preview"]),
            models.Index(fields=["file_format"]),
        ]

    def __str__(self) -> str:
        return f"{self.product.name} ({self.file_format})"
