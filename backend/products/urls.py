from django.urls import path

from products.views import (
    AdminProductDetailView,
    AdminProductFileDetailView,
    AdminProductFileUploadView,
    AdminProductImageDetailView,
    AdminProductImageUploadView,
    AdminProductListCreateView,
    ProductDetailView,
    ProductListView,
)

app_name = "products"

public_urlpatterns = [
    path("", ProductListView.as_view(), name="product-list"),
    path("<slug:slug>/", ProductDetailView.as_view(), name="product-detail"),
]

admin_urlpatterns = [
    path("", AdminProductListCreateView.as_view(), name="admin-products"),
    path(
        "<uuid:product_id>/",
        AdminProductDetailView.as_view(),
        name="admin-product-detail",
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

urlpatterns = public_urlpatterns
