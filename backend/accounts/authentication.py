"""JWT authentication that rejects access tokens with a stale ``tv`` claim."""

from __future__ import annotations

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class VersionedJWTAuthentication(JWTAuthentication):
    """Compare access-token ``tv`` to ``user.token_version`` after base validation."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        try:
            token_tv = int(validated_token.get("tv", 0) or 0)
        except (TypeError, ValueError) as exc:
            raise InvalidToken("Token is invalid or expired") from exc
        current = int(getattr(user, "token_version", 0) or 0)
        if token_tv != current:
            raise InvalidToken("Token is invalid or expired")
        return user
