from rest_framework import serializers

from coupons.models import Coupon


class CouponAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = (
            "id",
            "code",
            "discount_type",
            "discount_value",
            "expiry_date",
            "active",
            "max_uses",
            "max_uses_per_user",
            "times_used",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CouponCreateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32, trim_whitespace=True)
    discount_type = serializers.ChoiceField(choices=Coupon.DiscountType.choices)
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    active = serializers.BooleanField(required=False, default=True)
    max_uses = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    max_uses_per_user = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
    )


class CouponUpdateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32, trim_whitespace=True, required=False)
    discount_type = serializers.ChoiceField(
        choices=Coupon.DiscountType.choices,
        required=False,
    )
    discount_value = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
    )
    expiry_date = serializers.DateField(required=False, allow_null=True)
    active = serializers.BooleanField(required=False)
    max_uses = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    max_uses_per_user = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
    )

    def validate(self, attrs: dict) -> dict:
        if "expiry_date" in self.initial_data and self.initial_data.get("expiry_date") is None:
            attrs["clear_expiry_date"] = True
        if "max_uses" in self.initial_data and self.initial_data.get("max_uses") is None:
            attrs["clear_max_uses"] = True
        if (
            "max_uses_per_user" in self.initial_data
            and self.initial_data.get("max_uses_per_user") is None
        ):
            attrs["clear_max_uses_per_user"] = True
        return attrs
