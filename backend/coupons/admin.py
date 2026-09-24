from django.contrib import admin

from coupons.models import Coupon


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "discount_type",
        "discount_value",
        "active",
        "expiry_date",
        "times_used",
        "max_uses",
        "created_at",
    )
    list_filter = ("active", "discount_type")
    search_fields = ("code",)
    readonly_fields = ("id", "times_used", "created_at", "updated_at")
