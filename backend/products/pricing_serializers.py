"""Request and response shapes for the Pricing page API (docs/PRICING_PIPELINE.md, Part 2)."""

from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from products.models import Product
from products.pricing import (
    DEFAULT_HIGH_ABOVE,
    DEFAULT_LOW_BELOW,
    MAX_MODELS_PER_ACTION,
    RULE_AMOUNT_OFF,
    RULE_PERCENT_OFF,
    RULE_SET_PRICE,
    RULE_TIER_PRICE,
    RULES,
    SALE_RULES,
    TIERS,
    PolyThresholds,
    PricingRule,
)
from products.errors import ProductError
from products.serializers import AwareDateTimeField

_MONEY = {"max_digits": 10, "decimal_places": 2}


class PricingRowSerializer(serializers.ModelSerializer):
    """One model on the Pricing page list."""

    category = serializers.SerializerMethodField()
    poly_tier = serializers.SerializerMethodField()
    discount_active = serializers.SerializerMethodField()
    buyer_pays = serializers.SerializerMethodField()

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
            "poly_tier",
            "price",
            "currency",
            "discount_price",
            "discount_ends_at",
            "discount_active",
            "buyer_pays",
            "import_batch_id",
            "created_at",
        )
        read_only_fields = fields

    def _thresholds(self) -> PolyThresholds:
        return self.context.get("thresholds") or PolyThresholds()

    def get_category(self, obj: Product) -> dict:
        category = obj.category
        return {"id": str(category.pk), "name": category.name, "parent_id": category.parent_id and str(category.parent_id)}

    def get_poly_tier(self, obj: Product) -> str:
        return self._thresholds().tier(obj.polygon_count)

    def get_discount_active(self, obj: Product) -> bool:
        return obj.active_discount_price(self.context.get("now")) is not None

    def get_buyer_pays(self, obj: Product) -> str:
        return f"{obj.effective_price(self.context.get('now')):.2f}"


class _ThresholdFields(serializers.Serializer):
    low_below = serializers.IntegerField(required=False, min_value=1, default=DEFAULT_LOW_BELOW)
    high_above = serializers.IntegerField(required=False, min_value=1, default=DEFAULT_HIGH_ABOVE)

    def thresholds(self) -> PolyThresholds:
        data = self.validated_data
        try:
            return PolyThresholds(data["low_below"], data["high_above"])
        except ProductError as exc:
            raise serializers.ValidationError({"low_below": [exc.message]}) from exc


class PricingListQuerySerializer(_ThresholdFields):
    tab = serializers.ChoiceField(choices=("waiting", "live"))
    category_id = serializers.UUIDField(required=False)
    subcategory_id = serializers.UUIDField(required=False)
    poly = serializers.ChoiceField(choices=TIERS, required=False)
    search = serializers.CharField(required=False, allow_blank=True, max_length=100)
    import_batch_id = serializers.CharField(required=False, allow_blank=True, max_length=64)
    ordering = serializers.CharField(required=False, allow_blank=True, max_length=32)


class TierPricesSerializer(serializers.Serializer):
    low = serializers.DecimalField(required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY)
    mid = serializers.DecimalField(required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY)
    high = serializers.DecimalField(required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY)
    unknown = serializers.DecimalField(
        required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY
    )


class PricingRuleSerializer(_ThresholdFields):
    """The selection and the rule. The server calculates every price from these."""

    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=MAX_MODELS_PER_ACTION
    )
    rule = serializers.ChoiceField(choices=sorted(RULES))
    price = serializers.DecimalField(
        required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY
    )
    tier_prices = TierPricesSerializer(required=False)
    percent = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.01"),
        max_value=Decimal("90"),
    )
    amount = serializers.DecimalField(
        required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY
    )
    round_99 = serializers.BooleanField(required=False, default=False)
    discount_ends_at = AwareDateTimeField(required=False, allow_null=True, default=None)

    def validate(self, attrs: dict) -> dict:
        rule = attrs["rule"]
        if rule == RULE_SET_PRICE and attrs.get("price") is None:
            raise serializers.ValidationError({"price": ["Enter the price."]})
        if rule == RULE_TIER_PRICE and not any(
            value is not None for value in (attrs.get("tier_prices") or {}).values()
        ):
            raise serializers.ValidationError(
                {"tier_prices": ["Enter a price for at least one poly level."]}
            )
        if rule == RULE_PERCENT_OFF and attrs.get("percent") is None:
            raise serializers.ValidationError({"percent": ["Enter the percentage off (up to 90)."]})
        if rule == RULE_AMOUNT_OFF and attrs.get("amount") is None:
            raise serializers.ValidationError({"amount": ["Enter the amount off."]})
        ends_at = attrs.get("discount_ends_at")
        if ends_at is not None:
            if rule not in SALE_RULES:
                raise serializers.ValidationError(
                    {"discount_ends_at": ["A sale end goes with a % off or $ off rule."]}
                )
            if ends_at <= timezone.now():
                raise serializers.ValidationError(
                    {"discount_ends_at": ["The sale end must be in the future."]}
                )
        return attrs

    def build_rule(self) -> PricingRule:
        data = self.validated_data
        tier_prices = {
            tier: value
            for tier, value in (data.get("tier_prices") or {}).items()
            if value is not None
        }
        return PricingRule(
            kind=data["rule"],
            thresholds=self.thresholds(),
            price=data.get("price") if data["rule"] == RULE_SET_PRICE else None,
            tier_prices=tier_prices if data["rule"] == RULE_TIER_PRICE else {},
            percent=data.get("percent") if data["rule"] == RULE_PERCENT_OFF else None,
            amount=data.get("amount") if data["rule"] == RULE_AMOUNT_OFF else None,
            round_99=bool(data.get("round_99")) and data["rule"] in SALE_RULES,
            discount_ends_at=data.get("discount_ends_at") if data["rule"] in SALE_RULES else None,
        )


class PricingApplySerializer(PricingRuleSerializer):
    preview_token = serializers.RegexField(r"^[0-9a-f]{64}$")
    confirm_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class PricingPublishSerializer(serializers.Serializer):
    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=MAX_MODELS_PER_ACTION
    )
    confirm_count = serializers.IntegerField(min_value=1)
