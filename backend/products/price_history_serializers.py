"""Serializer for the admin price history list."""

from __future__ import annotations

from rest_framework import serializers

from products.models import ProductPriceChange


class ProductPriceChangeSerializer(serializers.ModelSerializer):
    source_label = serializers.CharField(source="get_source_display", read_only=True)
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = ProductPriceChange
        fields = [
            "id",
            "source",
            "source_label",
            "batch_id",
            "currency",
            "old_price",
            "new_price",
            "old_discount_price",
            "new_discount_price",
            "old_discount_ends_at",
            "new_discount_ends_at",
            "created_at",
            "changed_by",
        ]
        read_only_fields = fields

    def get_changed_by(self, obj: ProductPriceChange) -> dict | None:
        user = obj.changed_by
        if user is None:
            return None
        return {"id": str(user.pk), "full_name": user.full_name, "email": user.email}
