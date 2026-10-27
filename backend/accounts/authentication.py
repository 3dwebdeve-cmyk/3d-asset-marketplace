"""JWT authentication with a token-version check, and catalog uploader API keys."""

from __future__ import annotations

from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from accounts.tokens import admin_session_expired


class VersionedJWTAuthentication(JWTAuthentication):
    """Compare access-token ``tv`` to ``user.token_version`` after base validation.

    Administrator tokens must also be inside the session limit and, when two-factor
    sign-in is required, carry the ``mfa`` claim. Tokens issued before these claims
    existed fail, so every administrator signs in again with the second factor.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        try:
            token_tv = int(validated_token.get("tv", 0) or 0)
        except (TypeError, ValueError) as exc:
            raise InvalidToken("Token is invalid or expired") from exc
        current = int(getattr(user, "token_version", 0) or 0)
        if token_tv != current:
            raise InvalidToken("Token is invalid or expired")

        from accounts.services import AuthenticationService

        if AuthenticationService.is_administrator(user):
            if admin_session_expired(validated_token.get("auth_time")):
                raise InvalidToken("Token is invalid or expired")
            if getattr(settings, "ADMIN_MFA_REQUIRED", True) and not validated_token.get("mfa"):
                raise InvalidToken("Token is invalid or expired")
        elif validated_token.get("sid"):
            from accounts import sessions

            # Ended by sign-out or by a newer device: stop now, not when the token expires.
            if not sessions.is_active(validated_token["sid"], user):
                raise InvalidToken("Token is invalid or expired")
        return user


class CatalogApiKeyAuthentication(BaseAuthentication):
    """``Authorization: Api-Key <key>`` for the catalog uploader exe.

    Attached only to the catalog-ingest import view, never to
    ``DEFAULT_AUTHENTICATION_CLASSES``, so a key opens nothing else.
    """

    keyword = b"api-key"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword:
            return None
        if len(parts) != 2:
            raise AuthenticationFailed("Invalid API key.")
        try:
            key = parts[1].decode("ascii")
        except UnicodeDecodeError as exc:
            raise AuthenticationFailed("Invalid API key.") from exc

        from accounts.api_keys import CatalogApiKeyService

        api_key = CatalogApiKeyService.verify(key)
        if api_key is None:
            raise AuthenticationFailed("Invalid API key.")
        return api_key.user, api_key

    def authenticate_header(self, request) -> str:
        return "Api-Key"
