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


class CategoryClickSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    click_count = serializers.IntegerField(read_only=True)


class CategoryAdminSerializer(serializers.ModelSerializer):
    parent = CategoryParentSerializer(read_only=True)
    parent_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    product_count = serializers.SerializerMethodField()

    def get_product_count(self, obj: Category) -> int:
        # Annotated by the admin queryset; counted here for a category saved in this request.
        count = getattr(obj, "product_count", None)
        return obj.products.count() if count is None else count

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
            "code",
            "pending_approval",
            "created_by_import",
            "created_from_batch",
            "rejected_at",
            "product_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "parent",
            "pending_approval",
            "created_by_import",
            "created_from_batch",
            "rejected_at",
            "product_count",
            "created_at",
            "updated_at",
        )


class CategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    image = serializers.URLField(required=False, allow_blank=True, default="")
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    # The Model ID code of the category's models, for example ELE; optional.
    code = serializers.CharField(max_length=5, required=False, allow_blank=True, default="")

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
    # null or "" removes the code (allowed only while the category has no models).
    code = serializers.CharField(max_length=5, required=False, allow_blank=True, allow_null=True)

    def validate_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters.")
        return normalized

    def validate(self, attrs: dict) -> dict:
        if "parent_id" in self.initial_data and self.initial_data.get("parent_id") is None:
            attrs["clear_parent"] = True
        if "code" in attrs and not attrs["code"]:
            attrs.pop("code")
            attrs["clear_code"] = True
        return attrs


class CategoryMergeSerializer(serializers.Serializer):
    into = serializers.UUIDField()
