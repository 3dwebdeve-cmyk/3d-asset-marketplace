from django.contrib import admin

from mail_log.models import OutboundEmailLog


@admin.register(OutboundEmailLog)
class OutboundEmailLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "event_type",
        "status",
        "recipient_hash",
        "related_object_type",
        "related_object_id",
        "subject",
        "created_at",
    )
    list_filter = ("status", "event_type", "related_object_type")
    search_fields = ("recipient_hash", "related_object_id", "subject", "error")
    readonly_fields = (
        "id",
        "event_type",
        "status",
        "recipient_hash",
        "related_object_type",
        "related_object_id",
        "subject",
        "error",
        "created_at",
        "updated_at",
    )
    ordering = ("-created_at",)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
