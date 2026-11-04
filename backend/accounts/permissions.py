from django.conf import settings
from rest_framework.permissions import BasePermission

from accounts.services import AuthenticationService


class IsAdministrator(BasePermission):
    """Allow only active users with the Administrator role.

    Role is checked from the database-backed user object, not from trusted
    client claims beyond JWT authentication.
    """

    message = "Administrator access required."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if user is None or not user.is_authenticated:
            return False
        return AuthenticationService.is_administrator(user)


class IsEmailVerified(BasePermission):
    """Require an authenticated user whose email address is verified.

    Used as defense-in-depth on checkout and other verified-account endpoints.
    Customer login already rejects unverified accounts.
    """

    message = "Please verify your email address before continuing."
    code = "email_not_verified"

    def has_permission(self, request, view) -> bool:
        user = request.user
        if user is None or not user.is_authenticated:
            return False
        return bool(getattr(user, "email_verified", False))


class HasCatalogApiKey(BasePermission):
    """Allow only a request authenticated by an uploader API key of the view's scope.

    A view sets ``ingest_scope`` ("models" by default, or "plugins"); a key issued for the
    other scope is refused.
    """

    message = "A catalog uploader API key is required."

    def has_permission(self, request, view) -> bool:
        from accounts.api_keys import SCOPE_MODELS, is_catalog_uploader
        from accounts.models import CatalogApiKey

        if not (isinstance(request.auth, CatalogApiKey) and is_catalog_uploader(request.user)):
            return False
        return request.auth.scope == getattr(view, "ingest_scope", SCOPE_MODELS)


class CatalogIngestIPAllowed(BasePermission):
    """Optional ``CATALOG_INGEST_ALLOWED_IPS`` allowlist (empty = any IP)."""

    message = "This network may not use the catalog ingest API."

    def has_permission(self, request, view) -> bool:
        from config.admin_lock import ip_is_allowed, parse_allowed_networks, request_client_ip

        networks = parse_allowed_networks(getattr(settings, "CATALOG_INGEST_ALLOWED_IPS", ()))
        if not networks:
            return True
        return ip_is_allowed(request_client_ip(request), networks)
