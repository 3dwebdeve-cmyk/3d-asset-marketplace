from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.auth_cookies import (
    clear_refresh_cookie,
    get_refresh_from_request,
    get_remember_from_request,
    set_refresh_cookie,
)
from accounts.admin_user_service import (
    AdminUserCreateData,
    AdminUserError,
    AdminUserService,
    AdminUserUpdateData,
)
from accounts.pagination import AdminUserPagination
from config.api_helpers import domain_error_response
from accounts.permissions import IsAdministrator
from accounts.serializers import (
    ActivityLogSerializer,
    AdminMfaConfirmSerializer,
    AdminMfaStartSerializer,
    AdminMfaVerifySerializer,
    AdminRecoveryCodesSerializer,
    AdminUserCreateSerializer,
    AdminUserResponseSerializer,
    AdminUserUpdateSerializer,
    AvatarUploadSerializer,
    ChangePasswordSerializer,
    EmailVerificationConfirmSerializer,
    EmailVerificationResendSerializer,
    GoogleLoginSerializer,
    LegalAcceptSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileResponseSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserResponseSerializer,
)
from accounts.activity_service import ActivityLogService
from accounts.legal_service import LegalAcceptanceService
from accounts.security_log import log_admin_action, log_auth_failure
from accounts.services import (
    AuthenticationError,
    AuthenticationService,
    EmailVerificationService,
    LoginData,
    PasswordResetService,
    ProfileService,
)
from accounts import login_guard, mfa
from accounts.security_notices import notify_admin_sign_in, notify_mfa_enabled, register_sign_in
from accounts.tokens import admin_session_expired, admin_session_max_seconds
from django.db import transaction
from accounts.throttles import (
    AvatarUploadRateThrottle,
    ChangePasswordRateThrottle,
    EmailVerificationConfirmRateThrottle,
    EmailVerificationResendEmailRateThrottle,
    EmailVerificationResendRateThrottle,
    LegalAcceptRateThrottle,
    LoginRateThrottle,
    PasswordResetConfirmRateThrottle,
    PasswordResetEmailRateThrottle,
    PasswordResetRateThrottle,
    RegisterRateThrottle,
    TokenRefreshRateThrottle,
)


def _login_locked_response() -> Response:
    minutes = max(1, login_guard.retry_after_seconds() // 60)
    return Response(
        {
            "detail": (
                "Too many failed sign-in attempts for this account. "
                f"Please try again in {minutes} minutes."
            ),
            "code": "throttled",
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _issue_auth_response(user, *, remember: bool, mfa_passed: bool = False) -> Response:
    """Return access + user in JSON; refresh only via httpOnly cookie."""
    tokens = AuthenticationService.build_tokens(user, mfa=mfa_passed)
    response = Response(
        {
            "access": tokens["access"],
            "user": UserResponseSerializer(user).data,
        },
        status=status.HTTP_200_OK,
    )
    is_admin = AuthenticationService.is_administrator(user)
    set_refresh_cookie(
        response,
        tokens["refresh"],
        remember=remember,
        max_age_seconds=admin_session_max_seconds() if is_admin else None,
    )
    return response


def _mfa_error(message: str, code: str = "mfa_invalid") -> Response:
    # 400, not 401: the browser has no session yet, so nothing should try a token refresh.
    return Response({"detail": message, "code": code}, status=status.HTTP_400_BAD_REQUEST)


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_serializer = UserResponseSerializer(user)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class LegalDocumentsView(APIView):
    """Public current legal document versions (for register / checkout UIs)."""

    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request: Request) -> Response:
        return Response({"versions": LegalAcceptanceService.current_versions()})


class LegalAcceptView(APIView):
    """Record acceptance of current legal document versions for the auth user."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [LegalAcceptRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = LegalAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        LegalAcceptanceService.record_acceptances(
            request.user,
            serializer.validated_data["accepted_legal"],
        )
        return Response(
            {
                "versions": LegalAcceptanceService.current_versions(),
                "accepted": True,
            },
            status=status.HTTP_200_OK,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credentials = LoginData(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )

        client_ip = LoginRateThrottle().get_ident(request)
        if login_guard.is_locked(credentials.email, client_ip):
            log_auth_failure(scope="customer_login_locked", email=credentials.email)
            return _login_locked_response()

        try:
            user = AuthenticationService.authenticate_customer(credentials)
        except AuthenticationError as exc:
            log_auth_failure(scope="customer_login", email=credentials.email)
            if exc.code == "invalid_credentials":
                login_guard.record_failure(credentials.email, client_ip)
            if exc.code == "email_not_verified":
                return Response(
                    {"detail": exc.message, "code": exc.code},
                    status=status.HTTP_403_FORBIDDEN,
                )
            raise AuthenticationFailed(exc.message) from exc

        login_guard.reset(credentials.email, client_ip)
        response = _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
        )
        register_sign_in(request, response, user)
        return response


class GoogleLoginView(APIView):
    """Exchange a Google ID token for marketplace customer JWTs."""

    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = AuthenticationService.authenticate_google_customer(
                serializer.validated_data["id_token"]
            )
        except AuthenticationError as exc:
            log_auth_failure(scope="google_login", email=None)
            raise AuthenticationFailed(exc.message) from exc

        response = _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
        )
        register_sign_in(request, response, user)
        return response


class AdminLoginView(APIView):
    """Password step of administrator sign-in.

    With ADMIN_MFA_REQUIRED (always on staging/production) this returns a short-lived
    ``mfa_token`` instead of a session; the code step issues the session.
    """

    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credentials = LoginData(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )

        client_ip = LoginRateThrottle().get_ident(request)
        if login_guard.is_locked(credentials.email, client_ip):
            log_auth_failure(scope="admin_login_locked", email=credentials.email)
            return _login_locked_response()

        try:
            user = AuthenticationService.authenticate_administrator(credentials)
        except AuthenticationError as exc:
            log_auth_failure(scope="admin_login", email=credentials.email)
            if exc.code == "invalid_credentials":
                login_guard.record_failure(credentials.email, client_ip)
            raise AuthenticationFailed(exc.message) from exc

        login_guard.reset(credentials.email, client_ip)
        if getattr(settings, "ADMIN_MFA_REQUIRED", True):
            return Response(
                {
                    "mfa_required": True,
                    "setup_required": not mfa.is_enrolled(user),
                    "mfa_token": mfa.issue_mfa_token(user),
                },
                status=status.HTTP_200_OK,
            )
        return _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
        )


class _AdminMfaStepView(APIView):
    """Shared checks for the code step of administrator sign-in."""

    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def _pending_admin(self, token: str):
        user = mfa.user_from_mfa_token(token)
        if not AuthenticationService.is_administrator(user):
            raise mfa.MfaError("Your sign-in expired. Enter your email and password again.")
        return user


class AdminMfaSetupView(_AdminMfaStepView):
    """Start authenticator setup for an administrator who has none yet."""

    def post(self, request: Request) -> Response:
        serializer = AdminMfaStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = self._pending_admin(serializer.validated_data["mfa_token"])
            secret, uri = mfa.start_enrollment(user)
        except mfa.MfaError as exc:
            return _mfa_error(str(exc), "mfa_expired")
        return Response({"secret": secret, "otpauth_uri": uri}, status=status.HTTP_200_OK)


class AdminMfaConfirmView(_AdminMfaStepView):
    """Finish setup with the first code; returns the session and the recovery codes."""

    def post(self, request: Request) -> Response:
        serializer = AdminMfaConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = self._pending_admin(serializer.validated_data["mfa_token"])
        except mfa.MfaError as exc:
            return _mfa_error(str(exc), "mfa_expired")

        client_ip = LoginRateThrottle().get_ident(request)
        if login_guard.is_locked(user.email, client_ip):
            return _login_locked_response()
        try:
            recovery_codes = mfa.confirm_enrollment(user, serializer.validated_data["code"])
        except mfa.MfaError as exc:
            login_guard.record_failure(user.email, client_ip)
            log_auth_failure(scope="admin_mfa_setup", email=user.email)
            return _mfa_error(str(exc))

        login_guard.reset(user.email, client_ip)
        notify_mfa_enabled(user)
        notify_admin_sign_in(request, user, method="totp")
        response = _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
            mfa_passed=True,
        )
        response.data["recovery_codes"] = recovery_codes
        return response


class AdminMfaVerifyView(_AdminMfaStepView):
    """Code step of administrator sign-in: authenticator code or one recovery code."""

    def post(self, request: Request) -> Response:
        serializer = AdminMfaVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = self._pending_admin(serializer.validated_data["mfa_token"])
        except mfa.MfaError as exc:
            return _mfa_error(str(exc), "mfa_expired")

        client_ip = LoginRateThrottle().get_ident(request)
        if login_guard.is_locked(user.email, client_ip):
            return _login_locked_response()
        try:
            method = mfa.verify_second_factor(
                user,
                code=serializer.validated_data.get("code", ""),
                recovery_code=serializer.validated_data.get("recovery_code", ""),
            )
        except mfa.MfaError as exc:
            login_guard.record_failure(user.email, client_ip)
            log_auth_failure(scope="admin_mfa_verify", email=user.email)
            return _mfa_error(str(exc))

        login_guard.reset(user.email, client_ip)
        notify_admin_sign_in(request, user, method=method)
        return _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
            mfa_passed=True,
        )


class AdminRecoveryCodesView(APIView):
    """How many recovery codes are left, and a fresh set behind a current code."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [ChangePasswordRateThrottle]

    def get(self, request: Request) -> Response:
        return Response(
            {
                "enrolled": mfa.is_enrolled(request.user),
                "remaining": mfa.remaining_recovery_codes(request.user),
            }
        )

    def post(self, request: Request) -> Response:
        serializer = AdminRecoveryCodesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            mfa.verify_second_factor(request.user, code=serializer.validated_data["code"])
        except mfa.MfaError as exc:
            return _mfa_error(str(exc))
        log_admin_action(
            action="mfa_recovery_codes_replaced",
            actor_id=str(request.user.pk),
            target_id=str(request.user.pk),
        )
        return Response({"recovery_codes": mfa.replace_recovery_codes(request.user)})


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        serializer = UserResponseSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminCurrentUserView(APIView):
    """Administrator-only session probe for the React admin shell."""

    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request) -> Response:
        serializer = UserResponseSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """Blacklist the refresh cookie and clear it. Cookie-only; no JSON refresh."""

    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        refresh = get_refresh_from_request(request)
        response = Response(status=status.HTTP_204_NO_CONTENT)

        if refresh:
            user = request.user if getattr(request.user, "is_authenticated", False) else None
            try:
                AuthenticationService.blacklist_refresh_token(refresh, user=user)
            except AuthenticationError as exc:
                clear_refresh_cookie(response)
                raise AuthenticationFailed(exc.message) from exc

        clear_refresh_cookie(response)
        return response


class CookieTokenRefreshView(APIView):
    """Rotate refresh from httpOnly cookie; return access only."""

    permission_classes = [AllowAny]
    throttle_classes = [TokenRefreshRateThrottle]

    def post(self, request: Request) -> Response:
        from rest_framework_simplejwt.exceptions import TokenError
        from rest_framework_simplejwt.tokens import RefreshToken

        from accounts.models import User

        raw = get_refresh_from_request(request)
        if not raw:
            raise AuthenticationFailed("Refresh token cookie is missing.")

        remember = get_remember_from_request(request)

        try:
            old_refresh = RefreshToken(raw)
            user_id = old_refresh.payload.get("user_id")
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist as exc:
                raise AuthenticationFailed("Invalid refresh token.") from exc
            if not user.is_active:
                raise AuthenticationFailed("Invalid refresh token.")

            try:
                refresh_tv = int(old_refresh.payload.get("tv", 0) or 0)
            except (TypeError, ValueError) as exc:
                raise TokenError("Token is invalid or expired") from exc
            if refresh_tv != int(getattr(user, "token_version", 0) or 0):
                raise TokenError("Token is invalid or expired")

            auth_time = old_refresh.payload.get("auth_time")
            mfa_passed = bool(old_refresh.payload.get("mfa"))
            is_admin = AuthenticationService.is_administrator(user)
            if is_admin and (
                admin_session_expired(auth_time)
                or (getattr(settings, "ADMIN_MFA_REQUIRED", True) and not mfa_passed)
            ):
                raise TokenError("Administrator session expired")

            # Recheck token validity after obtaining the account lock. Concurrent
            # requests must not both consume the same refresh token.
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=user.pk)
                old_refresh = RefreshToken(raw)
                if not user.is_active or refresh_tv != user.token_version:
                    raise TokenError("Token is invalid or expired")
                old_refresh.blacklist()
                tokens = AuthenticationService.build_tokens(
                    user,
                    auth_time=int(auth_time) if auth_time is not None else None,
                    mfa=mfa_passed,
                )
        except TokenError as exc:
            response = Response(
                {"detail": "Token is invalid or expired", "code": "token_not_valid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            # An already-rotated token is rejected, but deleting the cookie here
            # races the successful rotation's Set-Cookie and signs the buyer out
            # when checkout returns from Stripe. Expired or malformed tokens
            # still clear the dead cookie.
            if "blacklist" not in str(exc).lower():
                clear_refresh_cookie(response)
            return response

        response = Response({"access": tokens["access"]}, status=status.HTTP_200_OK)
        set_refresh_cookie(
            response,
            tokens["refresh"],
            remember=remember,
            max_age_seconds=admin_session_max_seconds() if is_admin else None,
        )
        return response


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ChangePasswordRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        try:
            AuthenticationService.change_password(
                request.user,
                current_password=serializer.validated_data["current_password"],
                new_password=serializer.validated_data["new_password"],
            )
        except AuthenticationError as exc:
            if exc.code == "email_not_verified":
                return Response(
                    {"detail": exc.message, "code": exc.code},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if "Current password" in exc.message:
                return Response(
                    {"current_password": [exc.message]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"new_password": [exc.message]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle, PasswordResetEmailRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PasswordResetService.request_reset(serializer.validated_data["email"])
        # Always succeed to avoid account enumeration.
        return Response(
            {
                "detail": (
                    "If an account exists for that email, "
                    "password reset instructions have been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetConfirmRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            PasswordResetService.confirm_reset(
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
                new_password=serializer.validated_data["new_password"],
            )
        except AuthenticationError as exc:
            return Response(
                {"detail": exc.message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = Response(
            {"detail": "Password has been reset. You can sign in with your new password."},
            status=status.HTTP_200_OK,
        )
        clear_refresh_cookie(response)
        return response


class EmailVerificationResendView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [
        EmailVerificationResendRateThrottle,
        EmailVerificationResendEmailRateThrottle,
    ]

    def post(self, request: Request) -> Response:
        serializer = EmailVerificationResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        EmailVerificationService.resend_verification(serializer.validated_data["email"])
        return Response(
            {
                "detail": (
                    "If an unverified account exists for that email, "
                    "a verification link has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class EmailVerificationConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [EmailVerificationConfirmRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = EmailVerificationConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            EmailVerificationService.confirm_verification(
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
            )
        except AuthenticationError as exc:
            return Response(
                {"detail": exc.message, "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "detail": (
                    "Your email has been verified. You can now sign in to your account."
                )
            },
            status=status.HTTP_200_OK,
        )


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile = ProfileService.get_or_create_profile(request.user)
        serializer = ProfileResponseSerializer(profile)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request: Request) -> Response:
        profile = ProfileService.get_or_create_profile(request.user)
        serializer = ProfileUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_profile = serializer.save()
        response_serializer = ProfileResponseSerializer(updated_profile)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class AvatarUploadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AvatarUploadRateThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request) -> Response:
        serializer = AvatarUploadSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        response_serializer = ProfileResponseSerializer(profile)
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request: Request) -> Response:
        profile = ProfileService.clear_avatar(request.user)
        response_serializer = ProfileResponseSerializer(profile)
        return Response(response_serializer.data, status=status.HTTP_200_OK)


def _admin_user_error_response(exc: AdminUserError) -> Response:
    return domain_error_response(exc, default_code="admin_user_error")


class AdminUserListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = AdminUserPagination

    def get(self, request: Request) -> Response:
        role_name = request.query_params.get("role") or None
        if role_name and role_name not in AdminUserService.ALLOWED_ROLES:
            raise ValidationError({"role": ["Invalid role filter."]})

        search = request.query_params.get("search") or None
        is_active_param = request.query_params.get("is_active")
        is_active: bool | None = None
        if is_active_param is not None:
            normalized = is_active_param.strip().lower()
            if normalized in {"true", "1"}:
                is_active = True
            elif normalized in {"false", "0"}:
                is_active = False
            else:
                raise ValidationError({"is_active": ["Must be true or false."]})

        queryset = AdminUserService.list_users(
            role_name=role_name,
            is_active=is_active,
            search=search,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = AdminUserResponseSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = AdminUserService.create_user(
                AdminUserCreateData(
                    full_name=serializer.validated_data["full_name"],
                    email=serializer.validated_data["email"],
                    password=serializer.validated_data["password"],
                    role_name=serializer.validated_data["role"],
                    phone=serializer.validated_data.get("phone", ""),
                    country=serializer.validated_data.get("country", ""),
                )
            )
        except AdminUserError as exc:
            return _admin_user_error_response(exc)

        log_admin_action(
            action="user_create",
            actor_id=str(request.user.pk),
            target_id=str(user.pk),
        )
        return Response(
            AdminUserResponseSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request, user_id) -> Response:
        try:
            user = AdminUserService.get_user(user_id)
        except AdminUserError as exc:
            raise NotFound(exc.message) from exc

        return Response(
            AdminUserResponseSerializer(user).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, user_id) -> Response:
        try:
            target = AdminUserService.get_user(user_id)
        except AdminUserError as exc:
            raise NotFound(exc.message) from exc

        serializer = AdminUserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            user = AdminUserService.update_user(
                actor=request.user,
                target=target,
                data=AdminUserUpdateData(
                    full_name=serializer.validated_data.get("full_name"),
                    phone=serializer.validated_data.get("phone"),
                    country=serializer.validated_data.get("country"),
                    role_name=serializer.validated_data.get("role"),
                    is_active=serializer.validated_data.get("is_active"),
                    email_verified=serializer.validated_data.get("email_verified"),
                ),
            )
        except AdminUserError as exc:
            return _admin_user_error_response(exc)

        log_admin_action(
            action="user_update",
            actor_id=str(request.user.pk),
            target_id=str(user.pk),
        )
        return Response(
            AdminUserResponseSerializer(user).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, user_id) -> Response:
        try:
            target = AdminUserService.get_user(user_id)
        except AdminUserError as exc:
            raise NotFound(exc.message) from exc

        try:
            user = AdminUserService.deactivate_user(
                actor=request.user,
                target=target,
            )
        except AdminUserError as exc:
            return _admin_user_error_response(exc)

        log_admin_action(
            action="user_deactivate",
            actor_id=str(request.user.pk),
            target_id=str(user.pk),
        )
        return Response(
            AdminUserResponseSerializer(user).data,
            status=status.HTTP_200_OK,
        )


class AdminActivityLogListView(APIView):
    """Paginated durable admin audit trail."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = AdminUserPagination

    def get(self, request: Request) -> Response:
        action = request.query_params.get("action") or None
        target_id = request.query_params.get("target_id") or None
        actor_param = request.query_params.get("actor_id")
        actor_id = None
        if actor_param:
            try:
                from uuid import UUID

                actor_id = UUID(str(actor_param))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"actor_id": ["Must be a valid UUID."]}) from exc

        queryset = ActivityLogService.list_logs(
            action=action,
            actor_id=actor_id,
            target_id=target_id,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = ActivityLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
