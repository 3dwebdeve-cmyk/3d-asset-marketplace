"""JWT authentication that rejects access tokens with a stale ``tv`` claim."""

from __future__ import annotations

from django.conf import settings
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
        return user
