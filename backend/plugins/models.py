import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify

from config.validators import validate_storage_path


def _build_unique_slug(
    model: type[models.Model],
    name: str,
    *,
    fallback: str,
    exclude_id: uuid.UUID | None = None,
) -> str:
    base = slugify(name.strip()) or fallback
    slug = base
    counter = 1
    queryset = model.objects.filter(slug=slug)
    if exclude_id is not None:
        queryset = queryset.exclude(pk=exclude_id)
    while queryset.exists():
        slug = f"{base}-{counter}"
        counter += 1
        queryset = model.objects.filter(slug=slug)
        if exclude_id is not None:
            queryset = queryset.exclude(pk=exclude_id)
    return slug


class PluginCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    image = models.URLField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plugin_categories"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["name"]),
        ]
        verbose_name_plural = "plugin categories"

    def __str__(self) -> str:
        return self.name

    @staticmethod
    def build_slug(name: str, *, exclude_id: uuid.UUID | None = None) -> str:
        return _build_unique_slug(
            PluginCategory,
            name,
            fallback="plugin-category",
            exclude_id=exclude_id,
        )


class Plugin(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class LicenseType(models.TextChoices):
        STANDARD = "standard", "Standard"
        EXTENDED = "extended", "Extended"
        COMMERCIAL = "commercial", "Commercial"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        PluginCategory,
        on_delete=models.PROTECT,
        related_name="plugins",
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
    version = models.CharField(max_length=64, default="1.0")
    compatibility = models.CharField(max_length=255, blank=True)
    documentation_url = models.URLField(blank=True)
    license_type = models.CharField(
        max_length=32,
        choices=LicenseType.choices,
        default=LicenseType.STANDARD,
    )
    average_rating = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[
            MinValueValidator(Decimal("0.00")),
            MaxValueValidator(Decimal("5.00")),
        ],
    )
    review_count = models.PositiveIntegerField(default=0)
    total_downloads = models.PositiveIntegerField(
        default=0,
        verbose_name="download links issued",
        help_text="Counts signed download links issued, not completed transfers.",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plugins"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["name"]),
            models.Index(fields=["category", "status"]),
            models.Index(fields=["price"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(price__gte=Decimal("0.00")),
                name="plugin_price_nonnegative",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(discount_price__isnull=True)
                    | models.Q(discount_price__gte=Decimal("0.00"))
                ),
                name="plugin_discount_nonnegative",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(discount_price__isnull=True)
                    | models.Q(discount_price__lte=models.F("price"))
                ),
                name="plugin_discount_lte_price",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(average_rating__gte=Decimal("0.00"))
                    & models.Q(average_rating__lte=Decimal("5.00"))
                ),
                name="plugin_rating_valid_range",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    @staticmethod
    def build_slug(name: str, *, exclude_id: uuid.UUID | None = None) -> str:
        return _build_unique_slug(
            Plugin,
            name,
            fallback="plugin",
            exclude_id=exclude_id,
        )


class PluginImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plugin = models.ForeignKey(
        Plugin,
        on_delete=models.CASCADE,
        related_name="images",
    )
    image_url = models.URLField()
    display_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plugin_images"
        ordering = ["display_order", "created_at"]
        indexes = [
            models.Index(fields=["plugin", "display_order"]),
            models.Index(fields=["plugin", "is_primary"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["plugin"],
                condition=models.Q(is_primary=True),
                name="one_primary_image_per_plugin",
            )
        ]

    def __str__(self) -> str:
        return f"{self.plugin.name} image {self.display_order}"


class PluginFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plugin = models.ForeignKey(
        Plugin,
        on_delete=models.CASCADE,
        related_name="files",
    )
    file_name = models.CharField(max_length=255)
    file_format = models.CharField(max_length=16)
    file_size = models.PositiveBigIntegerField()
    storage_path = models.CharField(max_length=512, validators=[validate_storage_path])
    version = models.CharField(max_length=64, default="1.0")
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plugin_files"
        ordering = ["-is_primary", "-created_at"]
        indexes = [
            models.Index(fields=["plugin", "is_primary"]),
            models.Index(fields=["file_format"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["plugin"],
                condition=models.Q(is_primary=True),
                name="one_primary_file_per_plugin",
            )
        ]

    def __str__(self) -> str:
        return f"{self.plugin.name} ({self.file_format})"
