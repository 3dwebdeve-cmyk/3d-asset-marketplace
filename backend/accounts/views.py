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
from accounts.permissions import IsAdministrator
from accounts.serializers import (
    AdminUserCreateSerializer,
    AdminUserResponseSerializer,
    AdminUserUpdateSerializer,
    AvatarUploadSerializer,
    ChangePasswordSerializer,
    EmailVerificationConfirmSerializer,
    EmailVerificationResendSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileResponseSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserResponseSerializer,
)
from accounts.security_log import log_admin_action, log_auth_failure
from accounts.services import (
    AuthenticationError,
    AuthenticationService,
    EmailVerificationService,
    LoginData,
    PasswordResetService,
    ProfileService,
)
from accounts.throttles import (
    AvatarUploadRateThrottle,
    EmailVerificationConfirmRateThrottle,
    EmailVerificationResendRateThrottle,
    LoginRateThrottle,
    PasswordResetConfirmRateThrottle,
    PasswordResetRateThrottle,
    RegisterRateThrottle,
    TokenRefreshRateThrottle,
)


def _issue_auth_response(user, *, remember: bool) -> Response:
    """Return access + user in JSON; refresh only via httpOnly cookie."""
    tokens = AuthenticationService.build_tokens(user)
    response = Response(
        {
            "access": tokens["access"],
            "user": UserResponseSerializer(user).data,
        },
        status=status.HTTP_200_OK,
    )
    set_refresh_cookie(response, tokens["refresh"], remember=remember)
    return response


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_serializer = UserResponseSerializer(user)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


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

        try:
            user = AuthenticationService.authenticate_customer(credentials)
        except AuthenticationError as exc:
            log_auth_failure(scope="customer_login", email=credentials.email)
            if exc.code == "email_not_verified":
                return Response(
                    {"detail": exc.message, "code": exc.code},
                    status=status.HTTP_403_FORBIDDEN,
                )
            raise AuthenticationFailed(exc.message) from exc

        return _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
        )


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

        return _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
        )


class AdminLoginView(APIView):
    """Issue JWT tokens only for Administrator accounts (admin UI login)."""

    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credentials = LoginData(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )

        try:
            user = AuthenticationService.authenticate_administrator(credentials)
        except AuthenticationError as exc:
            log_auth_failure(scope="admin_login", email=credentials.email)
            raise AuthenticationFailed(exc.message) from exc

        return _issue_auth_response(
            user,
            remember=bool(serializer.validated_data.get("remember_me", True)),
        )


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
                old_refresh.blacklist()
            except AttributeError:
                pass

            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist as exc:
                raise AuthenticationFailed("Invalid refresh token.") from exc
            if not user.is_active:
                raise AuthenticationFailed("Invalid refresh token.")

            tokens = AuthenticationService.build_tokens(user)
        except TokenError:
            response = Response(
                {"detail": "Token is invalid or expired", "code": "token_not_valid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response

        response = Response({"access": tokens["access"]}, status=status.HTTP_200_OK)
        set_refresh_cookie(response, tokens["refresh"], remember=remember)
        return response


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

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
    throttle_classes = [PasswordResetRateThrottle]

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
    throttle_classes = [EmailVerificationResendRateThrottle]

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
    if exc.field:
        return Response(
            {exc.field: [exc.message]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"detail": exc.message, "code": "admin_user_error"},
        status=status.HTTP_400_BAD_REQUEST,
    )


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
