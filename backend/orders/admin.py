from django.contrib import admin

from orders.models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("product_type", "product_id", "quantity", "purchase_price", "created_at")
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "user",
        "total_amount",
        "currency",
        "order_status",
        "payment_status",
        "created_at",
    )
    list_filter = ("order_status", "payment_status", "currency")
    search_fields = ("invoice_number", "user__email", "user__full_name")
    raw_id_fields = ("user",)
    readonly_fields = (
        "invoice_number",
        "total_amount",
        "currency",
        "created_at",
        "updated_at",
    )
    inlines = [OrderItemInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = (
        "order",
        "product_type",
        "product_id",
        "quantity",
        "purchase_price",
        "created_at",
    )
    list_filter = ("product_type",)
    raw_id_fields = ("order",)
    readonly_fields = ("created_at", "updated_at")
