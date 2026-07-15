from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "auth_login"


class RegisterRateThrottle(AnonRateThrottle):
    scope = "auth_register"


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = "auth_password_reset"
