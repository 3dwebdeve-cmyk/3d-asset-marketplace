"""Request and response shapes for the Pricing page API (docs/PRICING_PIPELINE.md)."""

from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from products.models import Product
from products.packages import is_single_zip
from products.pricing import (
    MAX_MODELS_PER_ACTION,
    PricingInput,
    package_summaries,
)

_MONEY = {"max_digits": 10, "decimal_places": 2}


class PricingRowSerializer(serializers.ModelSerializer):
    """One model on the Pricing page list."""

    category = serializers.SerializerMethodField()
    discount_active = serializers.SerializerMethodField()
    buyer_pays = serializers.SerializerMethodField()
    # Every package with its price and sale (a package with no price is not sold yet).
    packages = serializers.SerializerMethodField()
    # Its only zip is the Whole File zip: it is priced in the Single zip section.
    single_zip = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "sku",
            "slug",
            "thumbnail",
            "status",
            "pending_update",
            "category",
            "polygon_count",
            "hours_spent",
            "price",
            "currency",
            "discount_price",
            "discount_ends_at",
            "discount_active",
            "buyer_pays",
            "packages",
            "single_zip",
            "import_batch_id",
            "created_at",
        )
        read_only_fields = fields

    def get_category(self, obj: Product) -> dict:
        category = obj.category
        return {
            "id": str(category.pk),
            "name": category.name,
            "parent_id": category.parent_id and str(category.parent_id),
        }

    def get_discount_active(self, obj: Product) -> bool:
        return obj.active_discount_price(self.context.get("now")) is not None

    def get_buyer_pays(self, obj: Product) -> str:
        return f"{obj.effective_price(self.context.get('now')):.2f}"

    def _packages(self, obj: Product) -> list[dict]:
        return package_summaries(obj, self.context.get("now") or timezone.now())

    def get_packages(self, obj: Product) -> list[dict]:
        return self._packages(obj)

    def get_single_zip(self, obj: Product) -> bool:
        return is_single_zip(obj.files.all())


class PricingListQuerySerializer(serializers.Serializer):
    tab = serializers.ChoiceField(choices=("waiting", "live"))
    category_id = serializers.UUIDField(required=False)
    subcategory_id = serializers.UUIDField(required=False)
    search = serializers.CharField(required=False, allow_blank=True, max_length=100)
    import_batch_id = serializers.CharField(required=False, allow_blank=True, max_length=64)
    ordering = serializers.CharField(required=False, allow_blank=True, max_length=32)
    # The section: models with variations, or single-zip models (Whole File is their only zip).
    kind = serializers.ChoiceField(choices=("variations", "single_zip"), required=False)


class PricingCalculateSerializer(serializers.Serializer):
    """The selection, the rate per hour and the percent of every package.

    A missing package or an out-of-range value is refused by ``PricingInput.clean``, which
    names the field.
    """

    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=MAX_MODELS_PER_ACTION
    )
    rate = serializers.DecimalField(min_value=Decimal("0.01"), **_MONEY)
    # The percent of every variation; none for the Single zip section.
    percents = serializers.DictField(
        child=serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal("0.01")),
        required=False,
    )
    kind = serializers.ChoiceField(choices=("variations", "single_zip"), default="variations")

    def pricing_input(self) -> PricingInput:
        data = self.validated_data
        return PricingInput.clean(data["rate"], dict(data.get("percents") or {}), data["kind"])


class PricingPublishSerializer(PricingCalculateSerializer):
    preview_token = serializers.RegexField(r"^[0-9a-f]{64}$")
    confirm_count = serializers.IntegerField(min_value=1)


class PricingHoursItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    # null clears the hours.
    hours_spent = serializers.DecimalField(
        allow_null=True, max_digits=7, decimal_places=2, min_value=Decimal("0.01")
    )


class PricingHoursSerializer(serializers.Serializer):
    items = PricingHoursItemSerializer(many=True, allow_empty=False, max_length=MAX_MODELS_PER_ACTION)

    def validate_items(self, items: list[dict]) -> list[dict]:
        ids = [item["id"] for item in items]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("Each model may appear once.")
        return items
