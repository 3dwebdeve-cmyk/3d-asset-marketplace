from rest_framework import serializers

from reviews.models import Review, ReviewReaction, ReviewReply, ReviewReplyReaction


class ReviewAuthorSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    avatar = serializers.URLField(allow_blank=True)


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


class ReviewReplySerializer(serializers.ModelSerializer):
    author = ReviewAuthorSerializer(source="user", read_only=True)
    like_count = serializers.SerializerMethodField()
    dislike_count = serializers.SerializerMethodField()
    viewer_reaction = serializers.SerializerMethodField()

    class Meta:
        model = ReviewReply
        fields = (
            "id", "parent_id", "text", "author", "like_count", "dislike_count",
            "viewer_reaction", "created_at",
        )
        read_only_fields = fields

    def get_like_count(self, obj: ReviewReply) -> int:
        return obj.reactions.filter(value=ReviewReplyReaction.Value.LIKE).count()

    def get_dislike_count(self, obj: ReviewReply) -> int:
        return obj.reactions.filter(value=ReviewReplyReaction.Value.DISLIKE).count()

    def get_viewer_reaction(self, obj: ReviewReply) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        return obj.reactions.filter(user=request.user).values_list("value", flat=True).first()


class ReviewReplyCreateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=2000, trim_whitespace=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)


class ReviewReactionSerializer(serializers.Serializer):
    value = serializers.ChoiceField(choices=ReviewReaction.Value.choices)


class ReviewPublicSerializer(serializers.ModelSerializer):
    author = ReviewAuthorSerializer(source="user", read_only=True)
    replies = ReviewReplySerializer(many=True, read_only=True)
    like_count = serializers.SerializerMethodField()
    dislike_count = serializers.SerializerMethodField()
    viewer_reaction = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = (
            "id",
            "product_type",
            "product_id",
            "rating",
            "review_text",
            "author",
            "replies",
            "like_count",
            "dislike_count",
            "viewer_reaction",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_like_count(self, obj: Review) -> int:
        return obj.reactions.filter(value=ReviewReaction.Value.LIKE).count()

    def get_dislike_count(self, obj: Review) -> int:
        return obj.reactions.filter(value=ReviewReaction.Value.DISLIKE).count()

    def get_viewer_reaction(self, obj: Review) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        return obj.reactions.filter(user=request.user).values_list("value", flat=True).first()


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
