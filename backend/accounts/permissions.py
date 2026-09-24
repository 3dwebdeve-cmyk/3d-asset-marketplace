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

    Used as defense-in-depth on checkout and custom-project write endpoints.
    Customer login already rejects unverified accounts.
    """

    message = "Please verify your email address before continuing."
    code = "email_not_verified"

    def has_permission(self, request, view) -> bool:
        user = request.user
        if user is None or not user.is_authenticated:
            return False
        return bool(getattr(user, "email_verified", False))
