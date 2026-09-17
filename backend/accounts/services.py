from dataclasses import dataclass
import logging

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, User, UserProfile
from accounts.security_log import (
    log_email_verification,
    log_password_change,
    log_password_reset,
)
from accounts.storage import AvatarStorageService
from accounts.upload_rules import validate_avatar_upload

password_reset_token_generator = PasswordResetTokenGenerator()
dev_mail_logger = logging.getLogger("accounts.dev_mail")


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Token invalidates once email_verified becomes True."""

    def _make_hash_value(self, user, timestamp) -> str:
        email_verified = getattr(user, "email_verified", False)
        return f"{user.pk}{user.email}{email_verified}{timestamp}"


email_verification_token_generator = EmailVerificationTokenGenerator()


class RegistrationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class AuthenticationError(Exception):
    def __init__(self, message: str, *, code: str = "authentication_failed") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class RegistrationData:
    full_name: str
    email: str
    password: str
    phone: str = ""
    country: str = ""


class RegistrationService:
    CUSTOMER_ROLE = "Customer"

    @classmethod
    @transaction.atomic
    def register_user(cls, data: RegistrationData) -> User:
        email = data.email.strip().lower()

        if User.objects.filter(email=email).exists():
            raise RegistrationError("An account with this email already exists.")

        role = cls._get_customer_role()

        user = User.objects.create_user(
            email=email,
            full_name=data.full_name,
            password=data.password,
            role=role,
            phone=data.phone,
            country=data.country,
            email_verified=False,
        )

        UserProfile.objects.create(
            user=user,
            country=data.country.strip(),
        )

        EmailVerificationService.send_verification(user)

        return user

    @classmethod
    def _get_customer_role(cls) -> Role:
        role, _ = Role.objects.get_or_create(
            role_name=cls.CUSTOMER_ROLE,
            defaults={"description": "Marketplace customer"},
        )
        return role


@dataclass(frozen=True)
class LoginData:
    email: str
    password: str


class AuthenticationService:
    ADMINISTRATOR_ROLE = "Administrator"

    @staticmethod
    def authenticate_user(data: LoginData) -> User:
        email = data.email.strip().lower()
        user = authenticate(username=email, password=data.password)

        if user is None:
            raise AuthenticationError("Invalid email or password.")

        return user

    @classmethod
    def authenticate_administrator(cls, data: LoginData) -> User:
        """Authenticate credentials and require an active Administrator role."""
        user = cls.authenticate_user(data)
        if not cls.is_administrator(user):
            raise AuthenticationError("Administrator access required.")
        return user

    @classmethod
    def authenticate_customer(cls, data: LoginData) -> User:
        """Authenticate credentials and require a non-administrator (customer) account."""
        user = cls.authenticate_user(data)
        if cls.is_administrator(user):
            raise AuthenticationError(
                "Administrators must use the admin sign-in page."
            )
        if not user.email_verified:
            raise AuthenticationError(
                "Please verify your email address before signing in.",
                code="email_not_verified",
            )
        return user

    @classmethod
    def is_administrator(cls, user: User) -> bool:
        if user is None or not user.is_active:
            return False
        role = getattr(user, "role", None)
        return role is not None and role.role_name == cls.ADMINISTRATOR_ROLE

    @staticmethod
    def build_tokens(user: User) -> dict[str, str]:
        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }

    @classmethod
    @transaction.atomic
    def authenticate_google_customer(cls, id_token: str) -> User:
        """Verify a Google ID token and return (or create) a customer user."""
        client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "").strip()
        if not client_id:
            raise AuthenticationError("Google sign-in is not configured.")

        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token as google_id_token

            payload = google_id_token.verify_oauth2_token(
                id_token,
                google_requests.Request(),
                audience=client_id,
                # Local Windows clocks are often a few seconds behind Google.
                clock_skew_in_seconds=60,
            )
        except ImportError as exc:
            raise AuthenticationError(
                "Google sign-in is temporarily unavailable."
            ) from exc
        except ValueError as exc:
            raise AuthenticationError("Invalid Google sign-in token.") from exc

        issuer = payload.get("iss")
        if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
            raise AuthenticationError("Invalid Google sign-in token.")

        google_sub = str(payload.get("sub") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        if not google_sub or not email:
            raise AuthenticationError("Google account is missing required profile data.")

        if not payload.get("email_verified"):
            raise AuthenticationError("Google email address is not verified.")

        full_name = str(payload.get("name") or "").strip() or email.split("@")[0]
        picture = str(payload.get("picture") or "").strip()

        user = User.objects.select_related("role").filter(google_id=google_sub).first()
        if user is None:
            user = User.objects.select_related("role").filter(email=email).first()

        if user is not None:
            if not user.is_active:
                raise AuthenticationError("This account is inactive.")
            if cls.is_administrator(user):
                raise AuthenticationError(
                    "Administrators must use the admin sign-in page."
                )
            if user.google_id and user.google_id != google_sub:
                raise AuthenticationError(
                    "This email is already linked to a different Google account."
                )

            update_fields: list[str] = []
            if not user.google_id:
                user.google_id = google_sub
                update_fields.append("google_id")
            if not user.email_verified:
                user.email_verified = True
                update_fields.append("email_verified")
            if picture and not user.avatar:
                user.avatar = picture
                update_fields.append("avatar")
            if update_fields:
                update_fields.append("updated_at")
                user.save(update_fields=update_fields)
            return user

        role = RegistrationService._get_customer_role()
        user = User(
            email=email,
            full_name=full_name[:255],
            role=role,
            google_id=google_sub,
            email_verified=True,
            avatar=picture[:200] if picture else "",
        )
        user.set_unusable_password()
        user.save()
        UserProfile.objects.create(user=user)
        return user

    @staticmethod
    def blacklist_refresh_token(
        refresh_token: str,
        *,
        user: User | None = None,
    ) -> None:
        try:
            token = RefreshToken(refresh_token)
            if user is not None:
                token_user_id = token.payload.get("user_id")
                if str(token_user_id) != str(user.pk):
                    raise AuthenticationError("Invalid refresh token.")
            token.blacklist()
        except TokenError as exc:
            raise AuthenticationError("Invalid refresh token.") from exc

    @staticmethod
    def blacklist_all_refresh_tokens(user: User) -> None:
        """Invalidate every outstanding refresh token for the user (e.g. after password change)."""
        for outstanding in OutstandingToken.objects.filter(user_id=user.pk):
            BlacklistedToken.objects.get_or_create(token=outstanding)

    @staticmethod
    def change_password(user: User, current_password: str, new_password: str) -> None:
        if not user.email_verified:
            raise AuthenticationError(
                "Please verify your email address before changing your password.",
                code="email_not_verified",
            )

        if not user.check_password(current_password):
            raise AuthenticationError("Current password is incorrect.")

        if current_password == new_password:
            raise AuthenticationError(
                "New password must be different from the current password."
            )

        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])
        AuthenticationService.blacklist_all_refresh_tokens(user)
        log_password_change(
            action="change_success",
            email=user.email,
            user_id=str(user.pk),
        )

        from accounts.tasks import send_password_changed_task
        from config.celery_utils import enqueue_after_commit

        enqueue_after_commit(send_password_changed_task, str(user.pk))

    @classmethod
    def deliver_password_changed(cls, user: User) -> None:
        """Notify the account owner that their password was changed."""
        if not user.is_active or not (user.email or "").strip():
            return

        frontend_base = getattr(
            settings,
            "FRONTEND_BASE_URL",
            "http://localhost:5173",
        ).rstrip("/")
        reset_link = f"{frontend_base}/forgot-password"

        send_mail(
            subject="Your 3D Asset Marketplace password was changed",
            message=(
                "Your account password was just changed.\n\n"
                "If you made this change, no further action is needed.\n"
                "If you did not, reset your password immediately:\n"
                f"{reset_link}\n"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )


class PasswordResetService:
    @classmethod
    def request_reset(cls, email: str) -> None:
        """Enqueue a reset email when the account exists. Always no-op-safe for unknowns."""
        normalized = email.strip().lower()
        log_password_reset(action="request", email=normalized)
        user = User.objects.filter(email=normalized, is_active=True).first()
        if user is None:
            return

        from accounts.tasks import send_password_reset_task
        from config.celery_utils import enqueue_after_commit

        enqueue_after_commit(send_password_reset_task, str(user.pk))

    @classmethod
    def deliver_reset(cls, user: User) -> None:
        """Build and send a password reset email. Raises on SMTP failure."""
        if not user.is_active or not (user.email or "").strip():
            return

        uid = urlsafe_base64_encode(force_bytes(str(user.pk)))
        token = password_reset_token_generator.make_token(user)
        frontend_base = getattr(
            settings,
            "FRONTEND_BASE_URL",
            "http://localhost:5173",
        ).rstrip("/")
        reset_link = f"{frontend_base}/reset-password/{uid}/{token}"

        send_mail(
            subject="Reset your 3D Asset Marketplace password",
            message=(
                "We received a request to reset your password.\n\n"
                f"Open this link to choose a new password:\n{reset_link}\n\n"
                "If you did not request this, you can ignore this email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

    @classmethod
    @transaction.atomic
    def confirm_reset(
        cls,
        uid: str,
        token: str,
        new_password: str,
    ) -> None:
        user = cls._get_user_from_uid(uid)
        if user is None or not password_reset_token_generator.check_token(user, token):
            log_password_reset(action="confirm_failure", email=None)
            raise AuthenticationError("Invalid or expired password reset link.")

        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])
        AuthenticationService.blacklist_all_refresh_tokens(user)
        log_password_reset(
            action="confirm_success",
            email=user.email,
            user_id=str(user.pk),
        )

    @staticmethod
    def _get_user_from_uid(uid: str) -> User | None:
        """Resolve a urlsafe base64 user id. Invalid/truncated uids return None."""
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            return User.objects.filter(pk=user_id, is_active=True).first()
        except (TypeError, ValueError, OverflowError, ValidationError):
            return None


class EmailVerificationService:
    @staticmethod
    def _frontend_base_url() -> str:
        return getattr(
            settings,
            "FRONTEND_BASE_URL",
            "http://localhost:5173",
        ).rstrip("/")

    @staticmethod
    def _build_verification_link(user: User) -> str:
        uid = urlsafe_base64_encode(force_bytes(str(user.pk)))
        token = email_verification_token_generator.make_token(user)
        return (
            f"{EmailVerificationService._frontend_base_url()}"
            f"/verify-email/{uid}/{token}"
        )

    @classmethod
    def send_verification(cls, user: User) -> None:
        """Enqueue a verification email when the account is active and unverified."""
        if user.email_verified or not user.is_active:
            return

        from accounts.tasks import send_email_verification_task
        from config.celery_utils import enqueue_after_commit

        enqueue_after_commit(send_email_verification_task, str(user.pk))

    @classmethod
    def deliver_verification(cls, user: User) -> None:
        """Build and send a verification email. Raises on SMTP failure."""
        if user.email_verified or not user.is_active or not (user.email or "").strip():
            return

        verification_link = cls._build_verification_link(user)
        send_mail(
            subject="Verify your 3D Asset Marketplace email",
            message=(
                "Thanks for registering.\n\n"
                f"Confirm your email address by opening this link:\n{verification_link}\n\n"
                "If you did not create this account, you can ignore this email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        # Local DX: console EmailBackend already prints the message; this line
        # is easy to copy from `runserver` when SMTP is not configured.
        if settings.DEBUG:
            dev_mail_logger.warning(
                "EMAIL VERIFICATION LINK for %s:\n%s",
                user.email,
                verification_link,
            )

    @classmethod
    def resend_verification(cls, email: str) -> None:
        """Enqueue verification email when the account exists and is unverified."""
        normalized = email.strip().lower()
        log_email_verification(action="resend", email=normalized)
        user = User.objects.filter(
            email=normalized,
            is_active=True,
            email_verified=False,
        ).first()
        if user is None:
            return

        cls.send_verification(user)

    @classmethod
    @transaction.atomic
    def confirm_verification(cls, uid: str, token: str) -> User:
        user = PasswordResetService._get_user_from_uid(uid)
        if user is None:
            log_email_verification(action="confirm_failure", email=None)
            raise AuthenticationError("Invalid or expired email verification link.")

        if user.email_verified:
            log_email_verification(
                action="confirm_already_verified",
                email=user.email,
                user_id=str(user.pk),
            )
            return user

        if not email_verification_token_generator.check_token(user, token):
            log_email_verification(action="confirm_failure", email=user.email)
            raise AuthenticationError("Invalid or expired email verification link.")

        cls.mark_verified(user, action="confirm_success")
        return user

    @classmethod
    def mark_verified(cls, user: User, *, action: str = "mark_verified") -> User:
        """Mark an active user verified (confirm link, admin, or management command)."""
        if user.email_verified:
            return user
        user.email_verified = True
        user.save(update_fields=["email_verified", "updated_at"])
        log_email_verification(
            action=action,
            email=user.email,
            user_id=str(user.pk),
        )
        return user


@dataclass(frozen=True)
class ProfileUpdateData:
    company_name: str | None = None
    website: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None


class ProfileService:
    @staticmethod
    def get_or_create_profile(user: User) -> UserProfile:
        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={"country": user.country or ""},
        )
        return profile

    @classmethod
    @transaction.atomic
    def update_profile(cls, user: User, data: ProfileUpdateData) -> UserProfile:
        profile = cls.get_or_create_profile(user)
        updates = {
            field: value
            for field, value in (
                ("company_name", data.company_name),
                ("website", data.website),
                ("address", data.address),
                ("city", data.city),
                ("country", data.country),
            )
            if value is not None
        }

        if not updates:
            return profile

        for field, value in updates.items():
            setattr(profile, field, value)
        profile.save(update_fields=[*updates.keys(), "updated_at"])

        # Keep User.country aligned with the profile country when it changes.
        if "country" in updates and user.country != updates["country"]:
            user.country = updates["country"]
            user.save(update_fields=["country", "updated_at"])

        return profile

    @classmethod
    @transaction.atomic
    def update_avatar(cls, user: User, uploaded_file) -> UserProfile:
        validated = validate_avatar_upload(uploaded_file)
        previous_url = user.avatar or ""
        avatar_url = AvatarStorageService.save_avatar(
            user_id=str(user.id),
            uploaded=validated.file,
            extension=validated.extension,
        )
        user.avatar = avatar_url
        user.save(update_fields=["avatar", "updated_at"])
        AvatarStorageService.delete_if_managed(previous_url)
        return cls.get_or_create_profile(user)

    @classmethod
    @transaction.atomic
    def clear_avatar(cls, user: User) -> UserProfile:
        previous_url = user.avatar or ""
        if previous_url:
            user.avatar = ""
            user.save(update_fields=["avatar", "updated_at"])
            AvatarStorageService.delete_if_managed(previous_url)
        return cls.get_or_create_profile(user)
