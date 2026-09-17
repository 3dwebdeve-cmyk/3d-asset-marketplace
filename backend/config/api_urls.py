"""Canonical API route table (mounted under /api/v1/).

Legacy unversioned /api/... paths are aliased to these routes for one release
via LegacyApiPathAliasMiddleware — do not duplicate this include under /api/.
"""

from django.urls import include, path

from config.health import HealthzView

urlpatterns = [
    path("healthz/", HealthzView.as_view(), name="healthz"),
    path("auth/", include("accounts.urls")),
    path("categories/", include("categories.urls")),
    path("admin/categories/", include("categories.admin_urls")),
    path("products/", include("products.urls")),
    path("admin/products/", include("products.admin_urls")),
    path("plugins/", include("plugins.urls")),
    path("plugin-categories/", include("plugins.category_urls")),
    path("admin/plugins/", include("plugins.admin_urls")),
    path("admin/plugin-categories/", include("plugins.admin_category_urls")),
    path("custom-projects/", include("custom_projects.urls")),
    path("admin/custom-projects/", include("custom_projects.admin_urls")),
    path("orders/", include("orders.urls")),
    path("admin/orders/", include("orders.admin_urls")),
    path("admin/payments/", include("payments.admin_urls")),
    path("admin/dashboard/", include("analytics.admin_urls")),
    path("admin/analytics/", include("analytics.analytics_urls")),
    path("wishlist/", include("wishlist.urls")),
    path("cart/", include("cart.urls")),
    path("reviews/", include("reviews.urls")),
    path("admin/reviews/", include("reviews.admin_urls")),
    path("downloads/", include("downloads.urls")),
    path("admin/downloads/", include("downloads.admin_urls")),
    path("admin/coupons/", include("coupons.admin_urls")),
    path("contact/", include("contact.urls")),
    path("payments/", include("payments.urls")),
]
