
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from categories.models import Category
from config.media import SPIN_FRAME_COUNT
from products.models import Product, ProductFile, ProductImage
from products.packages import (
    PACKAGE_DESCRIPTIONS,
    PACKAGE_LABELS,
    PACKAGE_ORDER,
    PackageKind,
)
from products.upload_rules import (
    validate_product_file_upload,
    validate_product_image_upload,
)


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug")
        read_only_fields = fields


class ProductImageSerializer(serializers.ModelSerializer):
    edge_colors = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = (
            "id",
            "image_url",
            "display_order",
            "is_primary",
            "edge_colors",
            "aspect_ratio",
            "created_at",
        )
        read_only_fields = fields

    def get_edge_colors(self, image: ProductImage) -> dict[str, str] | None:
        if not image.edge_left_color or not image.edge_right_color:
            return None
        return {"left": image.edge_left_color, "right": image.edge_right_color}


class ProductFilePublicSerializer(serializers.ModelSerializer):
    """Public file metadata only — never exposes storage_path."""

    class Meta:
        model = ProductFile
        fields = (
            "id",
            "file_name",
            "file_format",
            "file_size",
            "version",
            "is_preview",
        )
        read_only_fields = fields


class ProductFileAdminSerializer(serializers.ModelSerializer):
    """A file as QA sees it; a package row also has its kind, label and price (null: not
    priced yet, so not sold)."""

    package_label = serializers.SerializerMethodField()

    def get_package_label(self, obj: ProductFile) -> str:
        return PACKAGE_LABELS.get(obj.package_kind, "")

    class Meta:
        model = ProductFile
        fields = (
            "id",
            "file_name",
            "file_format",
            "file_size",
            "storage_path",
            "version",
            "is_preview",
            "package_kind",
            "package_label",
            "price",
            "discount_price",
            "discount_ends_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ProductAdminCategorySerializer(serializers.ModelSerializer):
    """The category as QA needs it: a model in a category waiting for approval (or rejected)
    cannot be approved."""

    class Meta:
        model = Category
        fields = ("id", "name", "slug", "code", "is_active", "pending_approval", "rejected_at")
        read_only_fields = fields


# Archive containers say nothing about which software opens the model.
_ARCHIVE_FORMATS = frozenset({"zip", "rar", "7z"})


def product_formats(obj: Product, files) -> list[str]:
    """Model formats a buyer gets: the package contents plus the file rows."""
    formats = {str(fmt).lower().lstrip(".") for fmt in obj.package_formats or ()}
    formats.update(row.file_format.lower().lstrip(".") for row in files)
    return sorted(fmt for fmt in formats if fmt and fmt not in _ARCHIVE_FORMATS)


_PRICE_FIELD = serializers.DecimalField(max_digits=10, decimal_places=2)
_DATETIME_FIELD = serializers.DateTimeField()


# discount_price and discount_ends_at as a buyer sees them. Both come from
# Product.active_discount_price: the running sale price or null, and the sale end only while
# the sale runs. One clock reading per response keeps the two fields (and every product in a
# list) consistent at the moment a sale ends. (A comment, not a docstring: the OpenAPI schema
# would show a docstring as the description of every public product serializer.)
class BuyerPriceFieldsMixin(serializers.Serializer):
    discount_price = serializers.SerializerMethodField()
    discount_ends_at = serializers.SerializerMethodField()

    def _price_now(self):
        context = self.context
        now = context.get("_buyer_price_now")
        if now is None:
            now = timezone.now()
            context["_buyer_price_now"] = now
        return now

    @extend_schema_field(
        serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    )
    def get_discount_price(self, obj: Product):
        sale = obj.active_discount_price(self._price_now())
        return None if sale is None else _PRICE_FIELD.to_representation(sale)

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_discount_ends_at(self, obj: Product):
        if obj.discount_ends_at is None or obj.active_discount_price(self._price_now()) is None:
            return None
        return _DATETIME_FIELD.to_representation(obj.discount_ends_at)


def priced_packages(files) -> list[ProductFile]:
    """A product's packages that are for sale (priced), in PACKAGE_ORDER. ``files`` are its
    prefetched file rows."""
    rows = {
        row.package_kind: row
        for row in files
        if not row.is_preview and row.package_kind and row.price is not None
    }
    return [rows[kind] for kind in PACKAGE_ORDER if kind in rows]


def has_spin(obj: Product) -> bool:
    """A product shows a 360° viewer only with all 36 frames."""
    return len(obj.spin_images or ()) == SPIN_FRAME_COUNT


class ProductListPublicSerializer(BuyerPriceFieldsMixin, serializers.ModelSerializer):
    category = ProductCategorySerializer(read_only=True)
    formats = serializers.SerializerMethodField()
    # True when the product page has a 360° spin (for the card's "360°" badge).
    has_360 = serializers.SerializerMethodField()
    # The lowest price a buyer pays now among the model's packages, for a "From $X" card;
    # null when the model has one priced package (the card shows its price as before).
    price_from = serializers.SerializerMethodField()

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_price_from(self, obj: Product):
        now = self._price_now()
        packages = priced_packages(getattr(obj, "filter_files", ()))
        if len(packages) < 2:
            return None
        return _PRICE_FIELD.to_representation(min(row.effective_price(now) for row in packages))

    def get_formats(self, obj: Product) -> list[str]:
        return product_formats(obj, getattr(obj, "filter_files", ()))

    def get_has_360(self, obj: Product) -> bool:
        return has_spin(obj)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "slug",
            "short_description",
            "price",
            "currency",
            "discount_price",
            "discount_ends_at",
            "is_free",
            "thumbnail",
            "software_used",
            "formats",
            "category",
            "license_type",
            "average_rating",
            "review_count",
            "total_downloads",
            "has_360",
            "price_from",
            "created_at",
        )
        read_only_fields = fields


class ProductPackagePublicSerializer(serializers.Serializer):
    """One package a buyer can choose: its contents, size and price now."""

    kind = serializers.CharField(source="package_kind")
    label = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    file_size = serializers.IntegerField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    discount_price = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()
    sale_ends_at = serializers.SerializerMethodField()

    def get_label(self, obj: ProductFile) -> str:
        return PACKAGE_LABELS[obj.package_kind]

    def get_description(self, obj: ProductFile) -> str:
        return PACKAGE_DESCRIPTIONS[obj.package_kind]

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_discount_price(self, obj: ProductFile):
        sale = obj.active_discount_price(self.context["now"])
        return None if sale is None else _PRICE_FIELD.to_representation(sale)

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2))
    def get_effective_price(self, obj: ProductFile):
        return _PRICE_FIELD.to_representation(obj.effective_price(self.context["now"]))

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_sale_ends_at(self, obj: ProductFile):
        if obj.discount_ends_at is None or obj.active_discount_price(self.context["now"]) is None:
            return None
        return _DATETIME_FIELD.to_representation(obj.discount_ends_at)


class ProductDetailPublicSerializer(BuyerPriceFieldsMixin, serializers.ModelSerializer):
    category = ProductCategorySerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    files = ProductFilePublicSerializer(many=True, read_only=True)
    formats = serializers.SerializerMethodField()
    # The packages for sale (priced), in PACKAGE_ORDER: one option each on the product page.
    packages = serializers.SerializerMethodField()
    # What Whole File saves against buying the other listed packages one by one; null unless
    # Whole File and at least one other package are listed (and it does save).
    bundle_saving = serializers.SerializerMethodField()

    def get_formats(self, obj: Product) -> list[str]:
        return product_formats(obj, obj.files.all())

    @extend_schema_field(ProductPackagePublicSerializer(many=True))
    def get_packages(self, obj: Product) -> list[dict]:
        now = self._price_now()
        return ProductPackagePublicSerializer(
            priced_packages(obj.files.all()), many=True, context={"now": now}
        ).data

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True))
    def get_bundle_saving(self, obj: Product):
        now = self._price_now()
        prices = {row.package_kind: row.effective_price(now) for row in priced_packages(obj.files.all())}
        whole = prices.pop(PackageKind.WHOLE, None)
        if whole is None or not prices:
            return None
        saving = sum(prices.values()) - whole
        return _PRICE_FIELD.to_representation(saving) if saving > 0 else None

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "short_description",
            "price",
            "currency",
            "discount_price",
            "discount_ends_at",
            "is_free",
            "thumbnail",
            "preview_model",
            "preview_video",
            "spin_images",
            "polygon_count",
            "vertex_count",
            "software_used",
            "pbr_ready",
            "game_ready",
            "license_type",
            "average_rating",
            "review_count",
            "total_downloads",
            "category",
            "images",
            "files",
            "formats",
            "packages",
            "bundle_saving",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ProductAdminSerializer(serializers.ModelSerializer):
    category = ProductAdminCategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True, required=False)
    images = ProductImageSerializer(many=True, read_only=True)
    files = ProductFileAdminSerializer(many=True, read_only=True)
    reviewed_by = serializers.UUIDField(
        source="reviewed_by_id",
        read_only=True,
        allow_null=True,
    )
    # The stored discount_price / discount_ends_at, plus whether that sale runs now.
    discount_active = serializers.SerializerMethodField()

    def get_discount_active(self, obj: Product) -> bool:
        return obj.active_discount_price() is not None

    # "free" (zip under free-models/) or "paid"; see docs/PRICING_PIPELINE.md.
    upload_kind = serializers.SerializerMethodField()

    def get_upload_kind(self, obj: Product) -> str:
        from products.services import ProductService

        return ProductService.upload_kind(obj)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "slug",
            "sku",
            "import_batch_id",
            "import_source",
            "glb_checksum",
            "has_thumbnail",
            "has_preview",
            "has_package",
            "description",
            "short_description",
            "price",
            "currency",
            "discount_price",
            "discount_ends_at",
            "discount_active",
            "is_free",
            "thumbnail",
            "preview_model",
            "preview_video",
            "spin_images",
            "polygon_count",
            "vertex_count",
            "software_used",
            "pbr_ready",
            "game_ready",
            "license_type",
            "average_rating",
            "review_count",
            "total_downloads",
            "status",
            "reject_reason",
            "qa_notes",
            "reviewed_at",
            "reviewed_by",
            "pending_update",
            "upload_kind",
            "category",
            "category_id",
            "images",
            "files",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "category",
            "images",
            "files",
            "spin_images",
            "average_rating",
            "review_count",
            "total_downloads",
            "reject_reason",
            "qa_notes",
            "reviewed_at",
            "reviewed_by",
            "pending_update",
            "upload_kind",
            "created_at",
            "updated_at",
        )


# Prices live on the packages and are set on the Pricing page (docs/PACKAGES_PIPELINE.md); the
# product's price fields are their summary, so no product form or QA action sends them.
PRICE_FIELDS = ("price", "discount_price", "discount_ends_at")
PRICING_PAGE_MESSAGE = "Prices are set per package on the Pricing page."


def refuse_sent_fields(serializer: serializers.Serializer, names, message: str) -> None:
    """Refuse a request that sends any of ``names``, so an old client cannot think it set them."""
    sent = getattr(serializer, "initial_data", None) or {}
    if hasattr(sent, "keys"):
        refused = {name: [message] for name in names if name in sent}
        if refused:
            raise serializers.ValidationError(refused)


class ProductApproveSerializer(serializers.Serializer):
    """QA approval takes no fields: QA never sets a price (docs/PRICING_PIPELINE.md)."""

    def validate(self, attrs: dict) -> dict:
        refuse_sent_fields(
            self,
            ("pricing", "price"),
            "QA approval does not set prices. Set prices on the Pricing page.",
        )
        return attrs


class ProductBulkDeleteSerializer(serializers.Serializer):
    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=100
    )


class ProductRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(trim_whitespace=True, allow_blank=False)
    qa_notes = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    def validate_reason(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("Reject reason is required.")
        return normalized


class ProductCreateSerializer(serializers.Serializer):
    category_id = serializers.UUIDField()
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    short_description = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=500,
    )
    currency = serializers.CharField(required=False, default="USD", max_length=3)
    thumbnail = serializers.URLField(required=False, allow_blank=True, default="")
    preview_model = serializers.URLField(required=False, allow_blank=True, default="")
    preview_video = serializers.URLField(required=False, allow_blank=True, default="")
    polygon_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    vertex_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    software_used = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=255,
    )
    pbr_ready = serializers.BooleanField(required=False, default=False)
    game_ready = serializers.BooleanField(required=False, default=False)
    license_type = serializers.ChoiceField(
        choices=Product.LicenseType.choices,
        required=False,
        default=Product.LicenseType.STANDARD,
    )
    status = serializers.ChoiceField(
        choices=Product.Status.choices,
        required=False,
        default=Product.Status.DRAFT,
    )
    sku = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=64,
        default=None,
    )
    import_batch_id = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=64,
    )
    import_source = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=64,
    )
    glb_checksum = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=64,
    )
    has_thumbnail = serializers.BooleanField(required=False, default=False)
    has_preview = serializers.BooleanField(required=False, default=False)
    has_package = serializers.BooleanField(required=False, default=False)

    def validate_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return normalized

    def validate_sku(self, value: str | None) -> str | None:
        return Product.normalize_sku(value)

    def validate(self, attrs: dict) -> dict:
        refuse_sent_fields(self, PRICE_FIELDS, PRICING_PAGE_MESSAGE)
        return attrs


class AwareDateTimeField(serializers.DateTimeField):
    """ISO 8601 date and time that must name its time zone (``Z`` or an offset).

    DRF would read a time without a zone as server time (UTC); for a sale end chosen in
    the admin's local time that silently moves the end, so it is refused instead.
    """

    default_error_messages = {
        "naive": "Include the time zone, for example 2026-12-01T18:30:00+05:30 or ...Z.",
    }

    def to_internal_value(self, value):
        if isinstance(value, str):
            try:
                parsed = parse_datetime(value.strip())
            except ValueError:
                parsed = None
            if parsed is not None and timezone.is_naive(parsed):
                self.fail("naive")
        return super().to_internal_value(value)


class ProductUpdateSerializer(serializers.Serializer):
    category_id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=255, trim_whitespace=True, required=False)
    slug = serializers.SlugField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    short_description = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
    )
    currency = serializers.CharField(required=False, max_length=3)
    thumbnail = serializers.URLField(required=False, allow_blank=True)
    preview_model = serializers.URLField(required=False, allow_blank=True)
    preview_video = serializers.URLField(required=False, allow_blank=True)
    polygon_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    vertex_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    software_used = serializers.CharField(required=False, allow_blank=True, max_length=255)
    pbr_ready = serializers.BooleanField(required=False)
    game_ready = serializers.BooleanField(required=False)
    license_type = serializers.ChoiceField(
        choices=Product.LicenseType.choices,
        required=False,
    )
    status = serializers.ChoiceField(choices=Product.Status.choices, required=False)
    sku = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=64,
    )
    import_batch_id = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=64,
    )
    import_source = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=64,
    )
    glb_checksum = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=64,
    )
    has_thumbnail = serializers.BooleanField(required=False)
    has_preview = serializers.BooleanField(required=False)
    has_package = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return normalized

    def validate_sku(self, value: str | None) -> str | None:
        return Product.normalize_sku(value)

    def validate(self, attrs: dict) -> dict:
        refuse_sent_fields(self, PRICE_FIELDS, PRICING_PAGE_MESSAGE)
        if "polygon_count" in self.initial_data and self.initial_data.get("polygon_count") is None:
            attrs["clear_polygon_count"] = True
        if "vertex_count" in self.initial_data and self.initial_data.get("vertex_count") is None:
            attrs["clear_vertex_count"] = True
        if "sku" in self.initial_data and self.initial_data.get("sku") in ("", None):
            attrs["clear_sku"] = True
            attrs["sku"] = None
        return attrs


class ProductImageUploadSerializer(serializers.Serializer):
    image = serializers.ImageField()
    display_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_primary = serializers.BooleanField(required=False, default=False)

    def validate_image(self, value):
        validate_product_image_upload(value)
        return value


class ProductFileUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    version = serializers.CharField(required=False, allow_blank=True, default="1.0", max_length=64)
    is_preview = serializers.BooleanField(required=False, default=False)
    # Which package the file is; required for any file that is not the preview.
    package_kind = serializers.ChoiceField(
        choices=PackageKind.choices, required=False, allow_blank=True, default=""
    )

    def validate_file(self, value):
        validate_product_file_upload(value)
        return value


class CatalogImportExportsSerializer(serializers.Serializer):
    glb = serializers.CharField(required=False, allow_blank=True, default="")
    fbx = serializers.CharField(required=False, allow_blank=True, default="")
    obj = serializers.CharField(required=False, allow_blank=True, default="")
    gltf = serializers.CharField(required=False, allow_blank=True, default="")
    max = serializers.CharField(required=False, allow_blank=True, default="")
    glb_size = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )
    fbx_size = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )
    obj_size = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )
    gltf_size = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )
    max_size = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )


class CatalogImportPackageSerializer(serializers.Serializer):
    """One zip the tool made. Loose types on purpose: a wrong entry skips its row as
    invalid_packages instead of failing the whole batch (the import checks every field)."""

    kind = serializers.CharField(required=False, allow_blank=True, default="", max_length=32)
    key = serializers.CharField(required=False, allow_blank=True, default="", max_length=512)
    file_name = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    file_format = serializers.CharField(required=False, allow_blank=True, default="", max_length=32)
    file_size = serializers.IntegerField(required=False, allow_null=True, default=None)


class CatalogImportMediaSerializer(serializers.Serializer):
    thumbnail_key = serializers.CharField(required=False, allow_blank=True, default="")
    # Optional when the model has a 360° spin (spin_keys).
    preview_key = serializers.CharField(required=False, allow_blank=True, default="")
    # The main zip: one of the packages' keys.
    package_key = serializers.CharField(required=False, allow_blank=True, default="")
    # One entry per zip (docs/batch-ingest-contract.md). The cap is looser than the five kinds
    # so a wrong list skips its row instead of failing the batch.
    packages = CatalogImportPackageSerializer(many=True, required=False, default=list, max_length=10)
    gallery_keys = serializers.ListField(
        child=serializers.CharField(allow_blank=False, max_length=512),
        required=False,
        default=list,
        max_length=50,
    )
    # The 360° frames in spin order, always under 360/<ID>/. Absent (None) keeps the
    # product's current spin, [] clears it; anything else must be the 36 frames, or the
    # row is skipped as invalid_spin_keys. The cap is looser than 36 so a wrong count
    # skips that row instead of failing the whole batch; the import checks the rest.
    spin_keys = serializers.ListField(
        child=serializers.CharField(allow_blank=True, max_length=512),
        required=False,
        allow_null=True,
        default=None,
        max_length=50,
    )


class CatalogImportItemSerializer(serializers.Serializer):
    model_id = serializers.CharField(required=False, allow_blank=True, default="", max_length=64)
    name = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    # The sheet's category name: only used to link or create the category of the code in
    # model_id. The sheet's price is not read: packages are priced on the Pricing page.
    category = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    currency = serializers.CharField(required=False, allow_blank=True, default="USD", max_length=3)
    short_description = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=500,
    )
    description = serializers.CharField(required=False, allow_blank=True, default="")
    license_type = serializers.ChoiceField(
        choices=Product.LicenseType.choices,
        required=False,
        default=Product.LicenseType.STANDARD,
    )
    # Older Model Uploader builds still send these sheet columns. They are accepted so
    # those builds keep working, and ignored: the website no longer uses them.
    rigged = serializers.BooleanField(required=False, default=False)
    animated = serializers.BooleanField(required=False, default=False)
    pbr_ready = serializers.BooleanField(required=False, default=False)
    game_ready = serializers.BooleanField(required=False, default=False)
    software_used = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=255,
    )
    polygon_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    # Hours spent on the model. Any value is accepted here so a bad one never refuses the row;
    # the import ignores what is not a positive number (CatalogImportService._sheet_hours).
    hours_spent = serializers.JSONField(required=False, allow_null=True)
    glb_checksum = serializers.CharField(required=False, allow_blank=True, default="", max_length=64)
    qa_status = serializers.CharField(required=False, allow_blank=True, default="", max_length=64)
    folder_match_status = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=32,
    )
    r2_key_prefix = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=128,
    )
    exports = CatalogImportExportsSerializer(required=False)
    package_formats = serializers.ListField(
        child=serializers.CharField(max_length=16, trim_whitespace=True),
        required=False,
        default=list,
        max_length=32,
    )
    media = CatalogImportMediaSerializer(required=False)

    def validate(self, attrs: dict) -> dict:
        if "exports" not in attrs or attrs.get("exports") is None:
            attrs["exports"] = {}
        if "media" not in attrs or attrs.get("media") is None:
            attrs["media"] = {}
        return attrs


class CatalogImportEnvelopeSerializer(serializers.Serializer):
    import_batch_id = serializers.CharField(max_length=64, trim_whitespace=True)
    import_source = serializers.CharField(
        required=False,
        allow_blank=True,
        default="catalog-bridge",
        max_length=64,
        trim_whitespace=True,
    )
    items = CatalogImportItemSerializer(many=True, allow_empty=False)

    def validate_import_batch_id(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("import_batch_id is required.")
        return normalized

    def validate_items(self, value: list) -> list:
        if len(value) > 500:
            raise serializers.ValidationError("A batch may contain at most 500 items.")
        return value
