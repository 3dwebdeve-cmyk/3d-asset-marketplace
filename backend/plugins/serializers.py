from decimal import Decimal

from rest_framework import serializers

from plugins.models import Plugin, PluginCategory, PluginFile, PluginImage
from plugins.upload_rules import ValidatedPluginFileUpload, validate_plugin_file_upload
from products.upload_rules import (
    ValidatedProductImageUpload,
    validate_product_image_upload,
)


class PluginCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PluginCategory
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "image",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class PluginCategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    image = serializers.URLField(required=False, allow_blank=True, default="")

    def validate_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return value.strip()


class PluginCategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, trim_whitespace=True, required=False)
    slug = serializers.SlugField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    image = serializers.URLField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return value.strip()


class PluginImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PluginImage
        fields = ("id", "image_url", "display_order", "is_primary", "created_at")
        read_only_fields = fields


class PluginFilePublicSerializer(serializers.ModelSerializer):
    """Safe plugin package metadata; storage_path is intentionally excluded."""

    class Meta:
        model = PluginFile
        fields = (
            "id",
            "file_name",
            "file_format",
            "file_size",
            "version",
            "is_primary",
        )
        read_only_fields = fields


class PluginFileAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = PluginFile
        fields = (
            "id",
            "file_name",
            "file_format",
            "file_size",
            "version",
            "is_primary",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class PluginListPublicSerializer(serializers.ModelSerializer):
    category = PluginCategorySerializer(read_only=True)
    formats = serializers.SerializerMethodField()

    def get_formats(self, obj: Plugin) -> list[str]:
        files = getattr(obj, "filter_files", None)
        if files is None:
            files = getattr(obj, "_prefetched_objects_cache", {}).get("files", ())
        return sorted({row.file_format.lower().lstrip(".") for row in files})

    class Meta:
        model = Plugin
        fields = (
            "id",
            "name",
            "slug",
            "short_description",
            "price",
            "currency",
            "discount_price",
            "thumbnail",
            "version",
            "compatibility",
            "formats",
            "license_type",
            "average_rating",
            "review_count",
            "total_downloads",
            "category",
            "created_at",
        )
        read_only_fields = fields


class PluginDetailPublicSerializer(PluginListPublicSerializer):
    images = PluginImageSerializer(many=True, read_only=True)
    files = PluginFilePublicSerializer(many=True, read_only=True)

    class Meta(PluginListPublicSerializer.Meta):
        fields = PluginListPublicSerializer.Meta.fields + (
            "description",
            "documentation_url",
            "images",
            "files",
            "updated_at",
        )


class PluginAdminListSerializer(PluginListPublicSerializer):
    class Meta(PluginListPublicSerializer.Meta):
        fields = PluginListPublicSerializer.Meta.fields + ("status",)


class PluginAdminSerializer(serializers.ModelSerializer):
    category = PluginCategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True, required=False)
    images = PluginImageSerializer(many=True, read_only=True)
    files = PluginFileAdminSerializer(many=True, read_only=True)

    class Meta:
        model = Plugin
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
            "version",
            "compatibility",
            "documentation_url",
            "license_type",
            "average_rating",
            "review_count",
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
            "review_count",
            "total_downloads",
            "created_at",
            "updated_at",
        )


class PluginCreateSerializer(serializers.Serializer):
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
    version = serializers.CharField(required=False, default="1.0", max_length=64)
    compatibility = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=255,
    )
    documentation_url = serializers.URLField(
        required=False,
        allow_blank=True,
        default="",
    )
    license_type = serializers.ChoiceField(
        choices=Plugin.LicenseType.choices,
        required=False,
        default=Plugin.LicenseType.STANDARD,
    )
    status = serializers.ChoiceField(
        choices=Plugin.Status.choices,
        required=False,
        default=Plugin.Status.DRAFT,
    )

    def validate_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return value.strip()

    def validate_version(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Version cannot be empty.")
        return value.strip()

    def validate(self, attrs: dict) -> dict:
        discount = attrs.get("discount_price")
        price = attrs.get("price")
        if discount is not None and price is not None and discount > price:
            raise serializers.ValidationError(
                {"discount_price": ["Discount price cannot exceed price."]}
            )
        return attrs


class PluginUpdateSerializer(serializers.Serializer):
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
    version = serializers.CharField(required=False, max_length=64)
    compatibility = serializers.CharField(required=False, allow_blank=True, max_length=255)
    documentation_url = serializers.URLField(required=False, allow_blank=True)
    license_type = serializers.ChoiceField(
        choices=Plugin.LicenseType.choices,
        required=False,
    )
    status = serializers.ChoiceField(choices=Plugin.Status.choices, required=False)

    def validate_name(self, value: str) -> str:
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return value.strip()

    def validate_version(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Version cannot be empty.")
        return value.strip()

    def validate(self, attrs: dict) -> dict:
        if "discount_price" in self.initial_data and self.initial_data.get(
            "discount_price"
        ) is None:
            attrs["clear_discount_price"] = True
        return attrs


class PluginImageUploadSerializer(serializers.Serializer):
    validated_upload: ValidatedProductImageUpload

    image = serializers.ImageField()
    display_order = serializers.IntegerField(required=False, min_value=0, default=0)
    is_primary = serializers.BooleanField(required=False, default=False)

    def validate_image(self, value):
        self.validated_upload = validate_product_image_upload(value)
        return value


class PluginFileUploadSerializer(serializers.Serializer):
    validated_upload: ValidatedPluginFileUpload

    file = serializers.FileField()
    version = serializers.CharField(required=False, default="1.0", max_length=64)
    is_primary = serializers.BooleanField(required=False, default=False)

    def validate_file(self, value):
        self.validated_upload = validate_plugin_file_upload(value)
        return value

    def validate_version(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Version cannot be empty.")
        return value.strip()
