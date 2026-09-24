from django.urls import path

from downloads.views import (
    CustomerDownloadHistoryListView,
    DownloadEntitlementListView,
    PluginFileDownloadView,
    ProductFileDownloadView,
)

app_name = "downloads"

urlpatterns = [
    path(
        "entitlements/",
        DownloadEntitlementListView.as_view(),
        name="download-entitlements",
    ),
    path(
        "history/",
        CustomerDownloadHistoryListView.as_view(),
        name="download-history",
    ),
    path(
        "products/<uuid:product_id>/files/<uuid:file_id>/download/",
        ProductFileDownloadView.as_view(),
        name="product-file-download",
    ),
    path(
        "plugins/<uuid:plugin_id>/files/<uuid:file_id>/download/",
        PluginFileDownloadView.as_view(),
        name="plugin-file-download",
    ),
]
