"""Canonical API route table (mounted under /api/v1/)."""

from django.urls import include, path

from config.health import HealthzView
from config.openapi import GatedSpectacularAPIView, GatedSpectacularSwaggerView

urlpatterns = [
    path("healthz/", HealthzView.as_view(), name="healthz"),
    path("schema/", GatedSpectacularAPIView.as_view(), name="schema"),
    path(
        "schema/swagger-ui/",
        GatedSpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("auth/", include("accounts.urls")),
    path("admin/activity-logs/", include("accounts.admin_activity_urls")),
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
