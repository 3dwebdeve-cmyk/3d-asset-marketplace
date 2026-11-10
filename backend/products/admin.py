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
        "sku",
        "slug",
        "category",
        "price",
        "currency",
        "status",
        "created_at",
    )
    list_filter = ("status", "license_type", "category", "has_preview", "has_package")
    search_fields = ("name", "sku", "slug", "short_description", "import_batch_id")
    prepopulated_fields = {"slug": ("name",)}
    # Status and prices change only through /console (QA, the Pricing page, the product
    # form), which run the publish checks and write the price history and audit log.
    readonly_fields = (
        "status",
        "pending_update",
        "price",
        "currency",
        "discount_price",
        "discount_ends_at",
        "reviewed_at",
        "reviewed_by",
        "average_rating",
        "review_count",
        "total_downloads",
        "created_at",
        "updated_at",
    )
    inlines = [ProductImageInline, ProductFileInline]

    def has_add_permission(self, request) -> bool:
        # A new product needs a price; create it in /console instead.
        return False


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
