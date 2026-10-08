import hashlib

from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class IPRateThrottle(SimpleRateThrottle):
    """Key by client IP for every caller.

    Unlike ``AnonRateThrottle``, authenticated requests are not exempt, so an
    attacker cannot skip auth limits by sending their own valid Bearer token.
    """

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


def hash_email(value) -> str | None:
    email = str(value or "").strip().lower()
    if not email:
        return None
    return hashlib.sha256(email.encode("utf-8")).hexdigest()


class EmailScopedRateThrottle(SimpleRateThrottle):
    """Key by the submitted ``email`` so one inbox cannot be flooded from many IPs."""

    def get_cache_key(self, request, view):
        data = getattr(request, "data", None)
        email = data.get("email") if hasattr(data, "get") else None
        ident = hash_email(email)
        if ident is None:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}


class LoginRateThrottle(IPRateThrottle):
    scope = "auth_login"


class RegisterRateThrottle(IPRateThrottle):
    scope = "auth_register"


class LegalAcceptRateThrottle(UserRateThrottle):
    scope = "legal_accept"


class PasswordResetRateThrottle(IPRateThrottle):
    scope = "auth_password_reset"


class PasswordResetEmailRateThrottle(EmailScopedRateThrottle):
    scope = "auth_password_reset_email"


class PasswordResetConfirmRateThrottle(IPRateThrottle):
    scope = "auth_password_reset_confirm"


class ChangePasswordRateThrottle(UserRateThrottle):
    scope = "auth_change_password"


class EmailVerificationResendRateThrottle(IPRateThrottle):
    scope = "auth_email_verification_resend"


class EmailVerificationResendEmailRateThrottle(EmailScopedRateThrottle):
    scope = "auth_email_verification_resend_email"


class EmailVerificationConfirmRateThrottle(IPRateThrottle):
    scope = "auth_email_verification_confirm"


class TokenRefreshRateThrottle(IPRateThrottle):
    scope = "auth_token_refresh"


class AvatarUploadRateThrottle(UserRateThrottle):
    scope = "avatar_upload"


class AdminCategoryWriteRateThrottle(UserRateThrottle):
    scope = "admin_category_write"


class AdminProductWriteRateThrottle(UserRateThrottle):
    scope = "admin_product_write"


class AdminUploadRateThrottle(UserRateThrottle):
    """Bound costly image/package uploads separately from small admin writes."""

    scope = "admin_upload"


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


class ContactFormRateThrottle(IPRateThrottle):
    scope = "contact_form"


class CategoryClickRateThrottle(IPRateThrottle):
    scope = "category_click"


class CatalogSearchRateThrottle(IPRateThrottle):
    scope = "catalog_search"


class CspReportRateThrottle(IPRateThrottle):
    """Keep anonymous CSP reports from becoming a log-amplification vector."""

    scope = "csp_report"


class PaymentCheckoutRateThrottle(UserRateThrottle):
    scope = "payment_checkout"


class PaymentCheckoutDailyRateThrottle(UserRateThrottle):
    """Daily circuit breaker for calls that create/sync Stripe sessions."""

    scope = "payment_checkout_daily"
