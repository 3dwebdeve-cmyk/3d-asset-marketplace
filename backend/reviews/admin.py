from django.contrib import admin

from reviews.models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "product_type",
        "product_id",
        "rating",
        "is_hidden",
        "created_at",
    )
    list_filter = ("product_type", "is_hidden", "rating")
    search_fields = ("review_text", "user__email", "user__full_name")
    readonly_fields = ("id", "created_at", "updated_at")
