from django.urls import path

from products.views import (
    AdminCatalogImportView,
    AdminProductApproveView,
    AdminProductBulkDeleteView,
    AdminProductDetailView,
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
    path(
        "<uuid:product_id>/",
        AdminProductDetailView.as_view(),
        name="admin-product-detail",
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
