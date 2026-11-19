"""Request and response shapes for the Pricing page API (docs/PRICING_PIPELINE.md, Part 2)."""

from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from products.models import Product
from products.packages import PackageKind
from products.pricing import (
    DEFAULT_HIGH_ABOVE,
    DEFAULT_LOW_BELOW,
    MAX_MODELS_PER_ACTION,
    RULE_AMOUNT_OFF,
    RULE_PERCENT_OFF,
    RULE_HOURS_PRICE,
    RULE_SET_PRICE,
    RULES,
    MAX_DISCOUNT_PERCENT,
    SALE_RULES,
    TIERS,
    PolyThresholds,
    PricingRule,
    get_default_percents,
    package_summaries,
    summaries_bundle_warning,
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
    # Every package with its price and sale (a package with no price is not sold yet).
    packages = serializers.SerializerMethodField()
    bundle_warning = serializers.SerializerMethodField()

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
            "hours_spent",
            "hourly_rate",
            "package_percents",
            "price",
            "currency",
            "discount_price",
            "discount_ends_at",
            "discount_active",
            "buyer_pays",
            "packages",
            "bundle_warning",
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

    def _packages(self, obj: Product) -> list[dict]:
        return package_summaries(obj, self.context.get("now") or timezone.now())

    def get_packages(self, obj: Product) -> list[dict]:
        return self._packages(obj)

    def get_bundle_warning(self, obj: Product) -> str:
        return summaries_bundle_warning(self._packages(obj))


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


class PricingRuleSerializer(_ThresholdFields):
    """The selection and the rule. The server calculates every price from these."""

    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=MAX_MODELS_PER_ACTION
    )
    rule = serializers.ChoiceField(choices=sorted(RULES))
    # The package the rule prices (Whole File when not sent).
    package_kind = serializers.ChoiceField(
        choices=PackageKind.choices, required=False, default=PackageKind.WHOLE
    )
    price = serializers.DecimalField(
        required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY
    )
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
    # Hours rule: the sale switch (off by default) and the sale %, used only while it is on.
    sale_enabled = serializers.BooleanField(required=False, default=False)
    sale_percent = serializers.DecimalField(
        required=False,
        allow_null=True,
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.01"),
        max_value=MAX_DISCOUNT_PERCENT,
    )
    discount_ends_at = AwareDateTimeField(required=False, allow_null=True, default=None)

    def validate(self, attrs: dict) -> dict:
        rule = attrs["rule"]
        if rule == RULE_SET_PRICE and attrs.get("price") is None:
            raise serializers.ValidationError({"price": ["Enter the price."]})
        if rule == RULE_HOURS_PRICE and attrs["sale_enabled"] and attrs.get("sale_percent") is None:
            raise serializers.ValidationError(
                {"sale_percent": ["Enter the sale percentage (up to 90)."]}
            )
        if rule == RULE_PERCENT_OFF and attrs.get("percent") is None:
            raise serializers.ValidationError({"percent": ["Enter the percentage off (up to 90)."]})
        if rule == RULE_AMOUNT_OFF and attrs.get("amount") is None:
            raise serializers.ValidationError({"amount": ["Enter the amount off."]})
        ends_at = attrs.get("discount_ends_at")
        if ends_at is not None:
            if rule not in SALE_RULES or (rule == RULE_HOURS_PRICE and not attrs["sale_enabled"]):
                raise serializers.ValidationError(
                    {"discount_ends_at": ["A sale end goes with a sale (switch it on first)."]}
                )
            if ends_at <= timezone.now():
                raise serializers.ValidationError(
                    {"discount_ends_at": ["The sale end must be in the future."]}
                )
        return attrs

    def build_rule(self) -> PricingRule:
        data = self.validated_data
        kind = data["rule"]
        hours = kind == RULE_HOURS_PRICE
        sale_on = hours and data["sale_enabled"]
        return PricingRule(
            kind=kind,
            package_kind=data["package_kind"],
            thresholds=self.thresholds(),
            price=data.get("price") if kind == RULE_SET_PRICE else None,
            default_percents=get_default_percents() if hours else {},
            sale_percent=data.get("sale_percent") if sale_on else None,
            percent=data.get("percent") if kind == RULE_PERCENT_OFF else None,
            amount=data.get("amount") if kind == RULE_AMOUNT_OFF else None,
            round_99=bool(data.get("round_99")) and kind in (RULE_PERCENT_OFF, RULE_AMOUNT_OFF),
            discount_ends_at=data.get("discount_ends_at") if kind in SALE_RULES else None,
        )


class PricingApplySerializer(PricingRuleSerializer):
    preview_token = serializers.RegexField(r"^[0-9a-f]{64}$")
    confirm_count = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class PricingPublishSerializer(serializers.Serializer):
    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=MAX_MODELS_PER_ACTION
    )
    confirm_count = serializers.IntegerField(min_value=1)


class PricingInputItemSerializer(serializers.Serializer):
    """One model's hours, rate and own package percents. Only the keys sent change; a null
    hours or rate clears it, a null package percent goes back to the default."""

    id = serializers.UUIDField()
    hours_spent = serializers.DecimalField(
        required=False, allow_null=True, max_digits=7, decimal_places=2, min_value=Decimal("0.01")
    )
    hourly_rate = serializers.DecimalField(
        required=False, allow_null=True, min_value=Decimal("0.01"), **_MONEY
    )
    package_percents = serializers.DictField(
        child=serializers.DecimalField(
            allow_null=True, max_digits=6, decimal_places=2, min_value=Decimal("0.01")
        ),
        required=False,
    )


class PricingInputsSerializer(serializers.Serializer):
    items = PricingInputItemSerializer(many=True, allow_empty=False, max_length=MAX_MODELS_PER_ACTION)

    def validate_items(self, items: list[dict]) -> list[dict]:
        ids = [item["id"] for item in items]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("Each model may appear once.")
        return items


class PricingDefaultsSerializer(serializers.Serializer):
    package_percents = serializers.DictField(
        child=serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal("0.01")),
        allow_empty=False,
    )
