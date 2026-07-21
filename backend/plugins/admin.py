from django.contrib import admin

from plugins.models import Plugin, PluginCategory, PluginFile, PluginImage


@admin.register(PluginCategory)
class PluginCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")


class PluginImageInline(admin.TabularInline):
    model = PluginImage
    extra = 0
    readonly_fields = ("created_at", "updated_at")


class PluginFileInline(admin.TabularInline):
    model = PluginFile
    extra = 0
    readonly_fields = ("created_at", "updated_at")


@admin.register(Plugin)
class PluginAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "category",
        "version",
        "price",
        "currency",
        "status",
        "created_at",
    )
    list_filter = ("status", "license_type", "category")
    search_fields = ("name", "slug", "short_description", "compatibility")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("average_rating", "total_downloads", "created_at", "updated_at")
    inlines = [PluginImageInline, PluginFileInline]


@admin.register(PluginImage)
class PluginImageAdmin(admin.ModelAdmin):
    list_display = ("plugin", "display_order", "is_primary", "created_at")
    list_filter = ("is_primary",)
    search_fields = ("plugin__name",)


@admin.register(PluginFile)
class PluginFileAdmin(admin.ModelAdmin):
    list_display = (
        "plugin",
        "file_name",
        "file_format",
        "file_size",
        "version",
        "is_primary",
    )
    list_filter = ("file_format", "is_primary")
    search_fields = ("plugin__name", "file_name")
