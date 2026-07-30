from django.contrib import admin

from products.models import Product, ProductFile, ProductImage


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0
    readonly_fields = ("created_at", "updated_at")


class ProductFileInline(admin.TabularInline):
    model = ProductFile
    extra = 0
    readonly_fields = ("created_at", "updated_at")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "slug",
        "category",
        "price",
        "currency",
        "status",
        "created_at",
    )
    list_filter = ("status", "license_type", "category")
    search_fields = ("name", "slug", "short_description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = (
        "average_rating",
        "review_count",
        "total_downloads",
        "created_at",
        "updated_at",
    )
    inlines = [ProductImageInline, ProductFileInline]


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("product", "display_order", "is_primary", "created_at")
    list_filter = ("is_primary",)
    search_fields = ("product__name",)


@admin.register(ProductFile)
class ProductFileAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "file_name",
        "file_format",
        "file_size",
        "is_preview",
        "version",
    )
    list_filter = ("file_format", "is_preview")
    search_fields = ("product__name", "file_name")
