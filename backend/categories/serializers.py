from rest_framework import serializers

from categories.models import Category


class CategoryParentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug")
        read_only_fields = fields


class CategoryPublicSerializer(serializers.ModelSerializer):
    parent = CategoryParentSerializer(read_only=True)

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "image",
            "parent",
            "created_at",
        )
        read_only_fields = fields


class CategoryAdminSerializer(serializers.ModelSerializer):
    parent = CategoryParentSerializer(read_only=True)
    parent_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "slug",
            "description",
            "image",
            "parent",
            "parent_id",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "parent", "created_at", "updated_at")


class CategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    image = serializers.URLField(required=False, allow_blank=True, default="")
    parent_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return normalized


class CategoryUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, trim_whitespace=True, required=False)
    slug = serializers.SlugField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    image = serializers.URLField(required=False, allow_blank=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return normalized

    def validate(self, attrs: dict) -> dict:
        if "parent_id" in self.initial_data and self.initial_data.get("parent_id") is None:
            attrs["clear_parent"] = True
        return attrs
