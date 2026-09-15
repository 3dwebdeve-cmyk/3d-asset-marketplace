from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.throttles import TokenRefreshRateThrottle
from accounts.views import (
    AdminCurrentUserView,
    AdminLoginView,
    AdminUserDetailView,
    AdminUserListCreateView,
    AvatarUploadView,
    ChangePasswordView,
    CurrentUserView,
    EmailVerificationConfirmView,
    EmailVerificationResendView,
    GoogleLoginView,
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    RegisterView,
)


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [TokenRefreshRateThrottle]

app_name = "accounts"

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("admin/login/", AdminLoginView.as_view(), name="admin-login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
    path("admin/me/", AdminCurrentUserView.as_view(), name="admin-me"),
    path("admin/users/", AdminUserListCreateView.as_view(), name="admin-users"),
    path(
        "admin/users/<uuid:user_id>/",
        AdminUserDetailView.as_view(),
        name="admin-user-detail",
    ),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "email-verification/resend/",
        EmailVerificationResendView.as_view(),
        name="email-verification-resend",
    ),
    path(
        "email-verification/confirm/",
        EmailVerificationConfirmView.as_view(),
        name="email-verification-confirm",
    ),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/avatar/", AvatarUploadView.as_view(), name="profile-avatar"),
    path("token/refresh/", ThrottledTokenRefreshView.as_view(), name="token-refresh"),
]
