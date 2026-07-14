from dataclasses import dataclass

from django.db import transaction

from accounts.models import Role, User, UserProfile


class RegistrationError(Exception):
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
