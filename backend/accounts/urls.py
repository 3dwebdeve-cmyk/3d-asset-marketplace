from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import CurrentUserView, LoginView, LogoutView, RegisterView

app_name = "accounts"

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
]
