from django.urls import path

from products.price_history_views import AdminProductPriceHistoryView
from products.pricing_views import (
    AdminPricingApplyView,
    AdminPricingBatchesView,
    AdminPricingListView,
    AdminPricingPreviewView,
    AdminPricingPublishView,
)
from products.views import (
    AdminCatalogImportView,
    AdminProductApproveView,
    AdminProductBulkDeleteView,
    AdminProductDetailView,
    AdminProductFileCheckView,
    AdminProductFileDetailView,
    AdminProductFileUploadView,
    AdminProductImageDetailView,
    AdminProductImageUploadView,
    AdminProductListCreateView,
    AdminProductRejectView,
    AdminProductRequeueView,
    AdminProductRestoreView,
    CatalogIngestImportView,
    ProductFreeDownloadView,
    ProductDetailView,
    ProductListView,
)

app_name = "products"

public_urlpatterns = [
    path("", ProductListView.as_view(), name="product-list"),
    path("<slug:slug>/", ProductDetailView.as_view(), name="product-detail"),
    path("<slug:slug>/free-download/", ProductFreeDownloadView.as_view(), name="product-free-download"),
]

admin_urlpatterns = [
    path("", AdminProductListCreateView.as_view(), name="admin-products"),
    path("import/", AdminCatalogImportView.as_view(), name="admin-catalog-import"),
    path("bulk-delete/", AdminProductBulkDeleteView.as_view(), name="admin-product-bulk-delete"),
    # Pricing page (docs/PRICING_PIPELINE.md, Part 2).
    path("pricing/", AdminPricingListView.as_view(), name="admin-pricing"),
    path("pricing/batches/", AdminPricingBatchesView.as_view(), name="admin-pricing-batches"),
    path("pricing/preview/", AdminPricingPreviewView.as_view(), name="admin-pricing-preview"),
    path("pricing/apply/", AdminPricingApplyView.as_view(), name="admin-pricing-apply"),
    path("pricing/publish/", AdminPricingPublishView.as_view(), name="admin-pricing-publish"),
    path(
        "<uuid:product_id>/",
        AdminProductDetailView.as_view(),
        name="admin-product-detail",
    ),
    path(
        "<uuid:product_id>/file-check/",
        AdminProductFileCheckView.as_view(),
        name="admin-product-file-check",
    ),
    path(
        "<uuid:product_id>/price-history/",
        AdminProductPriceHistoryView.as_view(),
        name="admin-product-price-history",
    ),
    path(
        "<uuid:product_id>/restore/",
        AdminProductRestoreView.as_view(),
        name="admin-product-restore",
    ),
    path(
        "<uuid:product_id>/approve/",
        AdminProductApproveView.as_view(),
        name="admin-product-approve",
    ),
    path(
        "<uuid:product_id>/reject/",
        AdminProductRejectView.as_view(),
        name="admin-product-reject",
    ),
    path(
        "<uuid:product_id>/requeue/",
        AdminProductRequeueView.as_view(),
        name="admin-product-requeue",
    ),
    path(
        "<uuid:product_id>/images/",
        AdminProductImageUploadView.as_view(),
        name="admin-product-images",
    ),
    path(
        "<uuid:product_id>/images/<uuid:image_id>/",
        AdminProductImageDetailView.as_view(),
        name="admin-product-image-detail",
    ),
    path(
        "<uuid:product_id>/files/",
        AdminProductFileUploadView.as_view(),
        name="admin-product-files",
    ),
    path(
        "<uuid:product_id>/files/<uuid:file_id>/",
        AdminProductFileDetailView.as_view(),
        name="admin-product-file-detail",
    ),
]

# API-key routes for the catalog uploader exe, mounted at /api/v1/catalog-ingest/.
ingest_urlpatterns = [
    path("import/", CatalogIngestImportView.as_view(), name="import"),
]

urlpatterns = public_urlpatterns
