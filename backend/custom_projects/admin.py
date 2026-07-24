from django.contrib import admin

from custom_projects.models import (
    CustomProject,
    ProjectDelivery,
    ProjectFile,
    ProjectMessage,
    ProjectMessageAttachment,
    ProjectMessageReadState,
    ProjectQuotation,
)


@admin.register(CustomProject)
class CustomProjectAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "customer",
        "status",
        "payment_status",
        "deadline",
        "created_at",
    )
    list_filter = ("status", "payment_status")
    search_fields = ("title", "customer__email", "customer__full_name")
    raw_id_fields = ("customer", "assigned_designer")


@admin.register(ProjectFile)
class ProjectFileAdmin(admin.ModelAdmin):
    list_display = ("file_name", "project", "file_type", "file_size", "created_at")
    list_filter = ("file_type",)
    raw_id_fields = ("project", "uploaded_by")


@admin.register(ProjectDelivery)
class ProjectDeliveryAdmin(admin.ModelAdmin):
    list_display = (
        "file_name",
        "project",
        "version",
        "file_size",
        "uploaded_by",
        "created_at",
    )
    list_filter = ("version",)
    search_fields = ("file_name", "project__title", "notes")
    raw_id_fields = ("project", "uploaded_by")

    def get_readonly_fields(self, request, obj=None):
        # storage_path editable on create (manual admin until upload API);
        # lock it after save so paths are not casually rewritten.
        if obj is None:
            return ("created_at", "updated_at")
        return ("storage_path", "created_at", "updated_at")


@admin.register(ProjectQuotation)
class ProjectQuotationAdmin(admin.ModelAdmin):
    list_display = ("project", "amount", "currency", "status", "created_at")
    list_filter = ("status",)
    raw_id_fields = ("project",)


@admin.register(ProjectMessage)
class ProjectMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "sender", "created_at")
    search_fields = ("body", "sender__email", "project__title")
    raw_id_fields = ("project", "sender")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ProjectMessageAttachment)
class ProjectMessageAttachmentAdmin(admin.ModelAdmin):
    list_display = ("file_name", "message", "file_size", "created_at")
    search_fields = ("file_name", "message__body", "message__project__title")
    raw_id_fields = ("message",)
    readonly_fields = ("storage_path", "created_at", "updated_at")


@admin.register(ProjectMessageReadState)
class ProjectMessageReadStateAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "user", "last_read_at", "updated_at")
    search_fields = ("project__title", "user__email", "user__full_name")
    raw_id_fields = ("project", "user")
    readonly_fields = ("created_at", "updated_at")
