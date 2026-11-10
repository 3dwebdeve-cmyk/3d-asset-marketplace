import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.utils.text import slugify

from config.validators import validate_storage_path

PLUGIN_ID_PATTERN = r"^PLG-[A-Z]{3}-\d{6}$"
PLUGIN_ID_VALIDATOR = RegexValidator(
    regex=PLUGIN_ID_PATTERN,
    message="Plugin ID must look like PLG-ABC-000001.",
)
PLUGIN_CATEGORY_CODE_VALIDATOR = RegexValidator(
    regex=r"^[A-Z]{3}$",
    message="Category code must be three uppercase letters.",
)


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
    # Three-letter code used in plugin IDs (PLG-<CODE>-000001); blank until assigned.
    code = models.CharField(
        max_length=3,
        unique=True,
        null=True,
        blank=True,
        validators=[PLUGIN_CATEGORY_CODE_VALIDATOR],
        help_text="Three uppercase letters used in plugin IDs, e.g. ANI.",
    )
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
        PENDING_REVIEW = "pending_review", "Pending review"
        PUBLISHED = "published", "Published"
        REJECTED = "rejected", "Rejected"
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
    # External Plugin_ID from the uploader; unique when set. Hand-made plugins stay null.
    plugin_id = models.CharField(
        max_length=16,
        unique=True,
        null=True,
        blank=True,
        validators=[PLUGIN_ID_VALIDATOR],
        help_text="Stable external Plugin_ID (e.g. PLG-ANI-000001). Used for batch upsert.",
    )
    import_batch_id = models.CharField(max_length=64, blank=True, default="")
    import_source = models.CharField(max_length=64, blank=True, default="")
    manifest = models.JSONField(default=dict, blank=True)
    description = models.TextField(blank=True)
    short_description = models.CharField(max_length=500, blank=True)
    price =models.DecimalField(
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
    # Review metadata (admin-only; never set by the importer).
    reject_reason = models.TextField(blank=True, default="")
    qa_notes = models.TextField(blank=True, default="")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_plugins",
    )
    # A published plugin was uploaded again: it stays on sale with the new files and waits in
    # the review queue until a reviewer approves (clears this) or rejects it (takes it off sale).
    # Only meaningful while the status is published.
    pending_update = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "plugins"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["import_batch_id"]),
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
