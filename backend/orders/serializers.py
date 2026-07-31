from decimal import Decimal

from rest_framework import serializers

from downloads.serializers import OrderItemDownloadFileSerializer
from downloads.services import DownloadService
from orders.entitlements import order_allows_download
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
    slug = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product_type",
            "product_id",
            "title",
            "slug",
            "quantity",
            "purchase_price",
            "line_total",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_title(self, obj: OrderItem) -> str | None:
        if obj.title:
            return obj.title
        titles = self.context.get("catalog_titles", {})
        return titles.get((obj.product_type, obj.product_id))

    def get_slug(self, obj: OrderItem) -> str | None:
        if obj.slug:
            return obj.slug
        slugs = self.context.get("catalog_slugs", {})
        return slugs.get((obj.product_type, obj.product_id))

    def get_line_total(self, obj: OrderItem) -> str:
        return f"{obj.line_total:.2f}"


class CustomerOrderItemDetailSerializer(OrderItemDetailSerializer):
    can_download = serializers.SerializerMethodField()
    files = serializers.SerializerMethodField()

    class Meta(OrderItemDetailSerializer.Meta):
        fields = OrderItemDetailSerializer.Meta.fields + (
            "can_download",
            "files",
        )

    def get_can_download(self, obj: OrderItem) -> bool:
        order = self.context.get("order")
        if order is None:
            return False
        return order_allows_download(order)

    def get_files(self, obj: OrderItem) -> list:
        order = self.context.get("order")
        if order is None or not order_allows_download(order):
            return []

        file_rows = DownloadService.list_downloadable_files_for_item(
            obj.product_type,
            obj.product_id,
        )
        request = self.context.get("request")
        return OrderItemDownloadFileSerializer(
            [
                {
                    "id": file_row.file_id,
                    "file_name": file_row.file_name,
                    "file_format": file_row.file_format,
                    "file_size": file_row.file_size,
                    "version": file_row.version,
                    "product_type": file_row.product_type,
                    "product_id": file_row.product_id,
                }
                for file_row in file_rows
            ],
            many=True,
            context={"request": request},
        ).data


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


class CustomerOrderListSerializer(serializers.ModelSerializer):
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
            "item_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CustomerOrderDetailSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    items = CustomerOrderItemDetailSerializer(many=True, read_only=True)
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
            "item_count",
            "items",
            "items_total",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_item_count(self, obj: Order) -> int:
        return obj.items.count()

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


class AdminOrderStatusUpdateSerializer(serializers.Serializer):
    order_status = serializers.ChoiceField(
        choices=Order.OrderStatus.choices,
        required=False,
    )
    payment_status = serializers.ChoiceField(
        choices=Order.PaymentStatus.choices,
        required=False,
    )

    def validate(self, attrs: dict) -> dict:
        if not attrs.get("order_status") and not attrs.get("payment_status"):
            raise serializers.ValidationError(
                "Provide order_status and/or payment_status."
            )
        return attrs
