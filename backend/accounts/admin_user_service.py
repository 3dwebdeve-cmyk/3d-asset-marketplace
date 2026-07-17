from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q, QuerySet

from accounts.models import Role, User, UserProfile
from accounts.services import AuthenticationService, EmailVerificationService


class AdminUserError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


@dataclass(frozen=True)
class AdminUserCreateData:
    full_name: str
    email: str
    password: str
    role_name: str
    phone: str = ""
    country: str = ""


@dataclass(frozen=True)
class AdminUserUpdateData:
    full_name: str | None = None
    phone: str | None = None
    country: str | None = None
    role_name: str | None = None
    is_active: bool | None = None


class AdminUserService:
    ALLOWED_ROLES = frozenset(
        {
            AuthenticationService.ADMINISTRATOR_ROLE,
            "Customer",
        }
    )

    @classmethod
    def list_users(
        cls,
        *,
        role_name: str | None = None,
        is_active: bool | None = None,
        search: str | None = None,
    ) -> QuerySet[User]:
        queryset = User.objects.select_related("role").all()

        if role_name:
            queryset = queryset.filter(role__role_name=role_name)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if search:
            query = search.strip()
            if query:
                queryset = queryset.filter(
                    Q(email__icontains=query) | Q(full_name__icontains=query)
                )

        return queryset.order_by("-created_at")

    @classmethod
    def get_user(cls, user_id) -> User:
        try:
            return User.objects.select_related("role").get(pk=user_id)
        except User.DoesNotExist as exc:
            raise AdminUserError("User not found.") from exc

    @classmethod
    @transaction.atomic
    def create_user(cls, data: AdminUserCreateData) -> User:
        role = cls._get_role(data.role_name)
        email = data.email.strip().lower()

        if User.objects.filter(email=email).exists():
            raise AdminUserError(
                "An account with this email already exists.",
                field="email",
            )

        user = User.objects.create_user(
            email=email,
            full_name=data.full_name.strip(),
            password=data.password,
            role=role,
            phone=data.phone.strip(),
            country=data.country.strip(),
        )
        user.is_staff = role.role_name == AuthenticationService.ADMINISTRATOR_ROLE
        if role.role_name == AuthenticationService.ADMINISTRATOR_ROLE:
            user.email_verified = True
            user.save(update_fields=["is_staff", "email_verified", "updated_at"])
        else:
            user.save(update_fields=["is_staff", "updated_at"])

        UserProfile.objects.get_or_create(
            user=user,
            defaults={"country": data.country.strip()},
        )

        if role.role_name != AuthenticationService.ADMINISTRATOR_ROLE:
            EmailVerificationService.send_verification(user)

        return user

    @classmethod
    @transaction.atomic
    def update_user(
        cls,
        *,
        actor: User,
        target: User,
        data: AdminUserUpdateData,
    ) -> User:
        update_fields: list[str] = ["updated_at"]

        if data.full_name is not None:
            target.full_name = data.full_name.strip()
            update_fields.append("full_name")

        if data.phone is not None:
            target.phone = data.phone.strip()
            update_fields.append("phone")

        if data.country is not None:
            target.country = data.country.strip()
            update_fields.append("country")

        if data.role_name is not None:
            cls._apply_role_change(actor=actor, target=target, role_name=data.role_name)
            update_fields.extend(["role", "is_staff"])

        if data.is_active is not None:
            cls._apply_active_change(
                actor=actor,
                target=target,
                is_active=data.is_active,
            )
            update_fields.append("is_active")

        target.save(update_fields=list(dict.fromkeys(update_fields)))
        return target

    @classmethod
    @transaction.atomic
    def deactivate_user(cls, *, actor: User, target: User) -> User:
        return cls.update_user(
            actor=actor,
            target=target,
            data=AdminUserUpdateData(is_active=False),
        )

    @classmethod
    def _get_role(cls, role_name: str) -> Role:
        if role_name not in cls.ALLOWED_ROLES:
            raise AdminUserError("Invalid role.", field="role")

        try:
            return Role.objects.get(role_name=role_name)
        except Role.DoesNotExist as exc:
            raise AdminUserError("Invalid role.", field="role") from exc

    @classmethod
    def _apply_role_change(cls, *, actor: User, target: User, role_name: str) -> None:
        role = cls._get_role(role_name)
        was_admin = AuthenticationService.is_administrator(target)
        will_be_admin = role.role_name == AuthenticationService.ADMINISTRATOR_ROLE

        if actor.pk == target.pk and was_admin and not will_be_admin:
            raise AdminUserError("You cannot remove your own administrator role.")

        if was_admin and not will_be_admin:
            cls._ensure_another_active_administrator(excluding_user_id=target.pk)

        target.role = role
        target.is_staff = will_be_admin

    @classmethod
    def _apply_active_change(
        cls,
        *,
        actor: User,
        target: User,
        is_active: bool,
    ) -> None:
        if actor.pk == target.pk and not is_active:
            raise AdminUserError("You cannot deactivate your own account.")

        if (
            AuthenticationService.is_administrator(target)
            and target.is_active
            and not is_active
        ):
            cls._ensure_another_active_administrator(excluding_user_id=target.pk)

        target.is_active = is_active

    @classmethod
    def _ensure_another_active_administrator(cls, *, excluding_user_id) -> None:
        remaining = User.objects.filter(
            role__role_name=AuthenticationService.ADMINISTRATOR_ROLE,
            is_active=True,
        ).exclude(pk=excluding_user_id)

        if not remaining.exists():
            raise AdminUserError(
                "Cannot modify the last active administrator account."
            )
