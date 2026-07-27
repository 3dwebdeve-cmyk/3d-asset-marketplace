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


class TokenRefreshRateThrottle(AnonRateThrottle):
    scope = "auth_token_refresh"


class AvatarUploadRateThrottle(UserRateThrottle):
    scope = "avatar_upload"


class AdminCategoryWriteRateThrottle(UserRateThrottle):
    scope = "admin_category_write"


class AdminProductWriteRateThrottle(UserRateThrottle):
    scope = "admin_product_write"


class AdminPluginWriteRateThrottle(UserRateThrottle):
    scope = "admin_plugin_write"


class AdminOrderWriteRateThrottle(UserRateThrottle):
    scope = "admin_order_write"


class AdminCustomProjectWriteRateThrottle(UserRateThrottle):
    scope = "admin_custom_project_write"


class CustomProjectWriteRateThrottle(UserRateThrottle):
    scope = "custom_project_write"
