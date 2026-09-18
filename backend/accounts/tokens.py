"""JWT helpers that embed a per-user token version claim (`tv`)."""

from __future__ import annotations

from rest_framework_simplejwt.tokens import RefreshToken


class VersionedRefreshToken(RefreshToken):
    """Refresh/access pair carrying ``tv`` = ``user.token_version``."""

    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)
        version = int(getattr(user, "token_version", 0) or 0)
        token["tv"] = version
        return token


def access_token_with_version(refresh: RefreshToken) -> str:
    """Build an access token that copies ``tv`` from the refresh token."""
    access = refresh.access_token
    access["tv"] = int(refresh.get("tv", 0) or 0)
    return str(access)
