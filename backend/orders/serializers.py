from decimal import Decimal

from rest_framework import serializers

from orders.models import Order, OrderItem


class OrderCustomerBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()


class OrderListSerializer(serializers.ModelSerializer):
    customer = OrderCustomerBriefSerializer(source="user", read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "invoice_number",
            "total_amount",
            "currency",
            "order_status",
            "payment_status",
            "customer",
            "item_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class OrderItemDetailSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product_type",
            "product_id",
            "title",
            "quantity",
            "purchase_price",
            "line_total",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_title(self, obj: OrderItem) -> str | None:
        titles = self.context.get("catalog_titles", {})
        return titles.get((obj.product_type, obj.product_id))

    def get_line_total(self, obj: OrderItem) -> str:
        return f"{obj.line_total:.2f}"


class OrderDetailSerializer(serializers.ModelSerializer):
    customer = OrderCustomerBriefSerializer(source="user", read_only=True)
    items = OrderItemDetailSerializer(many=True, read_only=True)
    items_total = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "invoice_number",
            "total_amount",
            "currency",
            "order_status",
            "payment_status",
            "customer",
            "items",
            "items_total",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_items_total(self, obj: Order) -> str:
        total = sum((item.line_total for item in obj.items.all()), start=Decimal("0.00"))
        return f"{total:.2f}"


class AdminOrderItemCreateSerializer(serializers.Serializer):
    product_type = serializers.ChoiceField(choices=OrderItem.ProductType.choices)
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class AdminOrderCreateSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    currency = serializers.RegexField(
        regex=r"^[A-Za-z]{3}$",
        required=False,
        default="USD",
        error_messages={"invalid": "Currency must be a 3-letter code."},
    )
    items = AdminOrderItemCreateSerializer(many=True, min_length=1)

    def validate_currency(self, value: str) -> str:
        return value.strip().upper()
