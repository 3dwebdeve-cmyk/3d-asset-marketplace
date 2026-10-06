from rest_framework import serializers

from wishlist.models import WishlistItem


class WishlistAddSerializer(serializers.Serializer):
    product_type = serializers.ChoiceField(choices=WishlistItem.ProductType.choices)
    product_id = serializers.UUIDField()


class WishlistItemSerializer(serializers.ModelSerializer):
    catalog = serializers.SerializerMethodField()

    class Meta:
        model = WishlistItem
        fields = (
            "id",
            "product_type",
            "product_id",
            "catalog",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_catalog(self, obj: WishlistItem) -> dict | None:
        snapshots = self.context.get("catalog_snapshots", {})
        return snapshots.get((obj.product_type, obj.product_id))
