"""OpenAPI / Swagger HTTP views — public in DEBUG, administrators only in prod."""

from __future__ import annotations

from django.conf import settings
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny, IsAuthenticated

from accounts.permissions import IsAdministrator


class GatedSpectacularAPIView(SpectacularAPIView):
    def get_permissions(self):
        if settings.DEBUG:
            return [AllowAny()]
        return [IsAuthenticated(), IsAdministrator()]


class GatedSpectacularSwaggerView(SpectacularSwaggerView):
    def get_permissions(self):
        if settings.DEBUG:
            return [AllowAny()]
        return [IsAuthenticated(), IsAdministrator()]
