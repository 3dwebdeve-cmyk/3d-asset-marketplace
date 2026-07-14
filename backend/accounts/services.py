from dataclasses import dataclass

from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, User, UserProfile


class RegistrationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class AuthenticationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
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
        )

        UserProfile.objects.create(
            user=user,
            country=data.country.strip(),
        )

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
    @staticmethod
    def authenticate_user(data: LoginData) -> User:
        email = data.email.strip().lower()
        user = authenticate(username=email, password=data.password)

        if user is None:
            raise AuthenticationError("Invalid email or password.")

        return user

    @staticmethod
    def build_tokens(user: User) -> dict[str, str]:
        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
