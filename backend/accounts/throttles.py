from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "auth_login"


class RegisterRateThrottle(AnonRateThrottle):
    scope = "auth_register"


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = "auth_password_reset"


class PasswordResetConfirmRateThrottle(AnonRateThrottle):
    scope = "auth_password_reset_confirm"


class EmailVerificationResendRateThrottle(AnonRateThrottle):
    scope = "auth_email_verification_resend"


class EmailVerificationConfirmRateThrottle(AnonRateThrottle):
    scope = "auth_email_verification_confirm"


class AdminCategoryWriteRateThrottle(UserRateThrottle):
    scope = "admin_category_write"
