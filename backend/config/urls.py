"""
URL configuration for config project.

Canonical REST API: /api/v1/...
"""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from config.media import serve_public_media

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("config.api_urls")),
]

# DEBUG only: serve public media prefixes. Private packages/references use
# authenticated download endpoints (see config.media.PUBLIC_MEDIA_PREFIXES).
if settings.DEBUG:
    urlpatterns += [
        path("media/<path:path>", serve_public_media, name="serve-public-media"),
    ]
