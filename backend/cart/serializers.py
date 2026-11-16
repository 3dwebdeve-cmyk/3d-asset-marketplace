from rest_framework import serializers

from cart.models import CartItem
from products.packages import PACKAGE_ORDER


class CartAddSerializer(serializers.Serializer):
    product_type = serializers.ChoiceField(choices=CartItem.ProductType.choices)
    product_id = serializers.UUIDField()
    # Required for a model (which package to buy); blank for a plugin.
    package_kind = serializers.ChoiceField(
        choices=PACKAGE_ORDER, required=False, allow_blank=True, default=""
    )
    quantity = serializers.IntegerField(
        required=False,
        default=1,
        min_value=1,
        max_value=CartItem.MAX_QUANTITY,
    )


class CartUpdateQuantitySerializer(serializers.Serializer):
    quantity = serializers.IntegerField(
        min_value=1,
        max_value=CartItem.MAX_QUANTITY,
    )


class CartCatalogSerializer(serializers.Serializer):
    name = serializers.CharField()
    # "<model name> - <package label>" for a model, the name for a plugin.
    title = serializers.CharField()
    package_kind = serializers.CharField(allow_blank=True)
    package_label = serializers.CharField(allow_blank=True)
    # On a Whole File line when the cart also holds other packages of that model.
    bundle_hint = serializers.CharField(allow_blank=True)
    slug = serializers.SlugField()
    thumbnail = serializers.URLField(allow_blank=True)
    price = serializers.CharField(allow_null=True)
    discount_price = serializers.CharField(allow_null=True)
    effective_price = serializers.CharField(allow_null=True)
    currency = serializers.CharField()
    category = serializers.DictField()
    is_available = serializers.BooleanField()


class CartItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    product_type = serializers.ChoiceField(choices=CartItem.ProductType.choices)
    product_id = serializers.UUIDField()
    package_kind = serializers.CharField(allow_blank=True)
    quantity = serializers.IntegerField()
    unit_price = serializers.CharField(allow_null=True)
    line_total = serializers.CharField(allow_null=True)
    catalog = CartCatalogSerializer(allow_null=True)


class CartSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    currency = serializers.CharField()
    subtotal = serializers.CharField()
    discount_amount = serializers.CharField()
    total = serializers.CharField()
    item_count = serializers.IntegerField()
    total_quantity = serializers.IntegerField()
    items = CartItemSerializer(many=True)
