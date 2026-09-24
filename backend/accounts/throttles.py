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


class WishlistWriteRateThrottle(UserRateThrottle):
    scope = "wishlist_write"


class CartWriteRateThrottle(UserRateThrottle):
    scope = "cart_write"


class ReviewWriteRateThrottle(UserRateThrottle):
    scope = "review_write"


class AdminReviewWriteRateThrottle(UserRateThrottle):
    scope = "admin_review_write"


class DownloadRateThrottle(UserRateThrottle):
    scope = "download"


class ContactFormRateThrottle(AnonRateThrottle):
    scope = "contact_form"


class CategoryClickRateThrottle(AnonRateThrottle):
    scope = "category_click"


class PaymentCheckoutRateThrottle(UserRateThrottle):
    scope = "payment_checkout"
