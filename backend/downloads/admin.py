from django.contrib import admin

from downloads.models import DownloadHistory


@admin.register(DownloadHistory)
class DownloadHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "downloaded_at",
        "user",
        "product_type",
        "product_id",
        "file_name",
        "order",
    )
    list_filter = ("product_type", "downloaded_at")
    search_fields = ("user__email", "file_name", "product_id")
    readonly_fields = (
        "user",
        "product_type",
        "product_id",
        "file_id",
        "file_name",
        "order",
        "downloaded_at",
    )
