from django.contrib import admin

from custom_projects.models import CustomProject, ProjectFile, ProjectQuotation


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


@admin.register(ProjectQuotation)
class ProjectQuotationAdmin(admin.ModelAdmin):
    list_display = ("project", "amount", "currency", "status", "created_at")
    list_filter = ("status",)
    raw_id_fields = ("project",)
