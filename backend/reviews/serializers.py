from rest_framework import serializers

from reviews.models import Review


class ReviewAuthorSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()


class ReviewCreateSerializer(serializers.Serializer):
    product_type = serializers.ChoiceField(choices=Review.ProductType.choices)
    product_id = serializers.UUIDField()
    rating = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        min_value=1,
        max_value=5,
    )
    review_text = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=2000,
        trim_whitespace=True,
    )

    def validate(self, attrs: dict) -> dict:
        if attrs.get("rating") is None and not attrs.get("review_text", "").strip():
            raise serializers.ValidationError(
                {"review_text": ["Write a comment or select a rating."]}
            )
        return attrs


class ReviewPublicSerializer(serializers.ModelSerializer):
    author = ReviewAuthorSerializer(source="user", read_only=True)

    class Meta:
        model = Review
        fields = (
            "id",
            "product_type",
            "product_id",
            "rating",
            "review_text",
            "author",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ReviewAdminSerializer(serializers.ModelSerializer):
    author = ReviewAuthorSerializer(source="user", read_only=True)
    author_email = serializers.EmailField(source="user.email", read_only=True)
    catalog = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = (
            "id",
            "product_type",
            "product_id",
            "rating",
            "review_text",
            "is_hidden",
            "author",
            "author_email",
            "catalog",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_catalog(self, obj: Review) -> dict | None:
        titles = self.context.get("catalog_titles", {})
        return titles.get((obj.product_type, obj.product_id))


class ReviewAdminUpdateSerializer(serializers.Serializer):
    is_hidden = serializers.BooleanField()
