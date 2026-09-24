from rest_framework import serializers

from cart.models import CartItem


class CartAddSerializer(serializers.Serializer):
    product_type = serializers.ChoiceField(choices=CartItem.ProductType.choices)
    product_id = serializers.UUIDField()
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
    slug = serializers.SlugField()
    thumbnail = serializers.URLField(allow_blank=True)
    price = serializers.CharField()
    discount_price = serializers.CharField(allow_null=True)
    effective_price = serializers.CharField()
    currency = serializers.CharField()
    category = serializers.DictField()
    is_available = serializers.BooleanField()


class CartItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    product_type = serializers.ChoiceField(choices=CartItem.ProductType.choices)
    product_id = serializers.UUIDField()
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
