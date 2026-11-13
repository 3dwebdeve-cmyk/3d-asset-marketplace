import re
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from config.validators import validate_storage_path

# Stable join key for batch ingest (Batch Output Report Model_ID), e.g. MDL-000142.
PRODUCT_SKU_REGEX = re.compile(r"^[A-Z0-9][A-Z0-9_-]*$")
PRODUCT_SKU_VALIDATOR = RegexValidator(
    regex=r"^[A-Z0-9][A-Z0-9_-]*$",
    message=(
        "SKU may only contain uppercase letters, digits, hyphens, and underscores, "
        "and must start with a letter or digit."
    ),
)


class Product(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        # A paid model passed QA (quality) and waits on the Pricing page for its price.
        AWAITING_PRICE = "awaiting_price", "Waiting for price"
        PUBLISHED = "published", "Published"
        REJECTED = "rejected", "Rejected"
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
    # External Model_ID from batch ingest; unique when set. Blank products stay null.
    sku = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        validators=[PRODUCT_SKU_VALIDATOR],
        help_text="Stable external Model_ID (e.g. MDL-000142). Used for batch upsert.",
    )
    import_batch_id = models.CharField(max_length=64, blank=True, default="")
    import_source = models.CharField(max_length=64, blank=True, default="")
    glb_checksum = models.CharField(max_length=64, blank=True, default="")
    has_thumbnail = models.BooleanField(default=False)
    has_preview = models.BooleanField(default=False)
    has_package = models.BooleanField(default=False)
    # Model formats inside the imported package (lowercase, no dot), e.g. ["fbx", "max"].
    package_formats = models.JSONField(default=list, blank=True)
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
    # When the sale price stops applying (UTC). Null: the sale runs until removed. Every
    # price read goes through active_discount_price(), so an ended sale is never charged,
    # even before the maintenance loop clears these fields.
    discount_ends_at = models.DateTimeField(null=True, blank=True)
    thumbnail = models.URLField(blank=True)
    preview_model = models.URLField(blank=True)
    # Triangles in the public preview, measured when it was stored. The preview must
    # be a reduced model (see PREVIEW_MAX_POLYGON_SHARE in products.services).
    preview_triangle_count = models.PositiveIntegerField(null=True, blank=True)
    preview_video = models.URLField(blank=True)
    # 360° turntable: the 36 public frame URLs in spin order (each with ?v=<hash>), or [].
    # Set only by the catalog import; the frames live under 360/<sku>/ in the public bucket.
    spin_images = models.JSONField(default=list, blank=True)
    polygon_count = models.PositiveIntegerField(null=True, blank=True)
    vertex_count = models.PositiveIntegerField(null=True, blank=True)
    material_count = models.PositiveIntegerField(null=True, blank=True)
    texture_map_types = models.JSONField(default=list, blank=True)
    texture_resolutions = models.JSONField(default=list, blank=True)
    texture_file_formats = models.JSONField(default=list, blank=True)
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
    # QA review metadata (admin-only; never auto-set by import/bridge).
    reject_reason = models.TextField(blank=True, default="")
    qa_notes = models.TextField(blank=True, default="")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_products",
    )
    # A published model was uploaded again: it stays on sale with the new files and waits in
    # the QA queue until a reviewer approves (clears this) or rejects it (takes it off sale).
    # Only meaningful while the status is published.
    pending_update = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "products"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["sku"]),
            models.Index(fields=["name"]),
            models.Index(fields=["status"]),
            models.Index(fields=["category", "status"]),
            models.Index(fields=["price"]),
            models.Index(fields=["import_batch_id"]),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def is_free(self) -> bool:
        """A free model (price 0) is downloaded without checkout."""
        return self.price is not None and self.price == 0

    def active_discount_price(self, now=None) -> Decimal | None:
        """The sale price while the sale runs, else None. The only way to read a sale price."""
        if self.discount_price is None:
            return None
        if self.discount_ends_at is not None and (now or timezone.now()) >= self.discount_ends_at:
            return None
        return self.discount_price

    def effective_price(self, now=None) -> Decimal:
        """What a buyer pays now: the running sale price, else the normal price."""
        discount = self.active_discount_price(now)
        return discount if discount is not None else self.price

    @staticmethod
    def normalize_sku(value: str | None) -> str | None:
        """Uppercase + strip; blank becomes None so unique allows many unset SKUs."""
        if value is None:
            return None
        normalized = value.strip().upper()
        return normalized or None

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


class ProductPriceChange(models.Model):
    """One change to a model's price, sale price or sale end (who, when, before and after).

    Written by products.price_history.record_price_change; never edited afterwards.
    """

    class Source(models.TextChoices):
        ADMIN_EDIT = "admin_edit", "Admin edit"
        QA_APPROVAL = "qa_approval", "QA approval"
        PRICING_PAGE = "pricing_page", "Pricing page"
        IMPORT = "import", "Upload import"
        SALE_ENDED = "sale_ended", "Sale ended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="price_changes")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_price_changes",
    )
    source = models.CharField(max_length=20, choices=Source.choices)
    # Groups the rows of one action (for example one Pricing page save); blank otherwise.
    batch_id = models.CharField(max_length=64, blank=True, default="")
    currency = models.CharField(max_length=3, default="USD")
    old_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    new_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    old_discount_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    new_discount_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    old_discount_ends_at = models.DateTimeField(null=True, blank=True)
    new_discount_ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "product_price_changes"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["product", "created_at"]),
            models.Index(fields=["batch_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.product_id} {self.old_price}->{self.new_price} ({self.source})"


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
    # Hex colours for the empty sides beside the render; blank until sampled.
    edge_left_color = models.CharField(max_length=7, blank=True, default="")
    edge_right_color = models.CharField(max_length=7, blank=True, default="")
    # Width divided by height of the render; null until sampled.
    aspect_ratio = models.FloatField(null=True, blank=True)
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
    storage_path = models.CharField(max_length=512, validators=[validate_storage_path])
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
