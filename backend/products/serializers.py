from decimal import Decimal

from rest_framework import serializers

from categories.models import Category
from products.models import Product, ProductFile, ProductImage
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
    class Meta:
        model = ProductImage
        fields = (
            "id",
            "image_url",
            "display_order",
            "is_primary",
            "created_at",
        )
        read_only_fields = fields


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
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ProductListPublicSerializer(serializers.ModelSerializer):
    category = ProductCategorySerializer(read_only=True)

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
            "thumbnail",
            "category",
            "license_type",
            "average_rating",
            "total_downloads",
            "created_at",
        )
        read_only_fields = fields


class ProductDetailPublicSerializer(serializers.ModelSerializer):
    category = ProductCategorySerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    files = ProductFilePublicSerializer(many=True, read_only=True)

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
            "thumbnail",
            "preview_model",
            "preview_video",
            "polygon_count",
            "vertex_count",
            "software_used",
            "animated",
            "rigged",
            "pbr_ready",
            "game_ready",
            "license_type",
            "average_rating",
            "total_downloads",
            "category",
            "images",
            "files",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ProductAdminSerializer(serializers.ModelSerializer):
    category = ProductCategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True, required=False)
    images = ProductImageSerializer(many=True, read_only=True)
    files = ProductFileAdminSerializer(many=True, read_only=True)

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
            "thumbnail",
            "preview_model",
            "preview_video",
            "polygon_count",
            "vertex_count",
            "software_used",
            "animated",
            "rigged",
            "pbr_ready",
            "game_ready",
            "license_type",
            "average_rating",
            "total_downloads",
            "status",
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
            "average_rating",
            "total_downloads",
            "created_at",
            "updated_at",
        )


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
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))
    currency = serializers.CharField(required=False, default="USD", max_length=3)
    discount_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0"),
        required=False,
        allow_null=True,
    )
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
    animated = serializers.BooleanField(required=False, default=False)
    rigged = serializers.BooleanField(required=False, default=False)
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

    def validate_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return normalized

    def validate(self, attrs: dict) -> dict:
        discount = attrs.get("discount_price")
        price = attrs.get("price")
        if discount is not None and price is not None and discount > price:
            raise serializers.ValidationError(
                {"discount_price": ["Discount price cannot exceed price."]}
            )
        return attrs


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
    price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0"),
        required=False,
    )
    currency = serializers.CharField(required=False, max_length=3)
    discount_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0"),
        required=False,
        allow_null=True,
    )
    thumbnail = serializers.URLField(required=False, allow_blank=True)
    preview_model = serializers.URLField(required=False, allow_blank=True)
    preview_video = serializers.URLField(required=False, allow_blank=True)
    polygon_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    vertex_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    software_used = serializers.CharField(required=False, allow_blank=True, max_length=255)
    animated = serializers.BooleanField(required=False)
    rigged = serializers.BooleanField(required=False)
    pbr_ready = serializers.BooleanField(required=False)
    game_ready = serializers.BooleanField(required=False)
    license_type = serializers.ChoiceField(
        choices=Product.LicenseType.choices,
        required=False,
    )
    status = serializers.ChoiceField(choices=Product.Status.choices, required=False)

    def validate_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return normalized

    def validate(self, attrs: dict) -> dict:
        if "discount_price" in self.initial_data and self.initial_data.get("discount_price") is None:
            attrs["clear_discount_price"] = True
        if "polygon_count" in self.initial_data and self.initial_data.get("polygon_count") is None:
            attrs["clear_polygon_count"] = True
        if "vertex_count" in self.initial_data and self.initial_data.get("vertex_count") is None:
            attrs["clear_vertex_count"] = True
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

    def validate_file(self, value):
        validate_product_file_upload(value)
        return value
