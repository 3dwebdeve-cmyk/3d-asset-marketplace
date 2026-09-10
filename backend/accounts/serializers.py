from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from accounts.models import User, UserProfile
from accounts.services import (
    ProfileService,
    ProfileUpdateData,
    RegistrationData,
    RegistrationError,
    RegistrationService,
)
from accounts.upload_rules import validate_avatar_upload


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    password_confirm = serializers.CharField(write_only=True, min_length=8, max_length=128)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    country = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")

    def validate_full_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Full name must be at least 2 characters.")
        return normalized

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate(self, attrs: dict) -> dict:
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )

        candidate = User(
            email=attrs["email"],
            full_name=attrs["full_name"],
        )
        try:
            validate_password(attrs["password"], candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

        return attrs

    def create(self, validated_data: dict) -> User:
        registration_data = RegistrationData(
            full_name=validated_data["full_name"],
            email=validated_data["email"],
            password=validated_data["password"],
            phone=validated_data.get("phone", ""),
            country=validated_data.get("country", ""),
        )

        try:
            return RegistrationService.register_user(registration_data)
        except RegistrationError as exc:
            raise serializers.ValidationError({"email": [exc.message]}) from exc


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True, trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True,
        max_length=128,
        trim_whitespace=False,
    )
    new_password = serializers.CharField(
        write_only=True,
        min_length=8,
        max_length=128,
        trim_whitespace=False,
    )
    new_password_confirm = serializers.CharField(
        write_only=True,
        min_length=8,
        max_length=128,
        trim_whitespace=False,
    )

    def validate(self, attrs: dict) -> dict:
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )

        user = self.context["request"].user
        try:
            validate_password(attrs["new_password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc

        return attrs


class EmailVerificationResendSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class EmailVerificationConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(write_only=True)
    token = serializers.CharField(write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(write_only=True)
    token = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True,
        min_length=8,
        max_length=128,
        trim_whitespace=False,
    )
    new_password_confirm = serializers.CharField(
        write_only=True,
        min_length=8,
        max_length=128,
        trim_whitespace=False,
    )

    def validate(self, attrs: dict) -> dict:
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Passwords do not match."}
            )

        try:
            validate_password(attrs["new_password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc

        return attrs


class UserResponseSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="role.role_name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "full_name",
            "email",
            "phone",
            "country",
            "avatar",
            "role",
            "email_verified",
            "created_at",
        )
        read_only_fields = fields


class AdminUserResponseSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="role.role_name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "full_name",
            "email",
            "phone",
            "country",
            "avatar",
            "role",
            "email_verified",
            "is_active",
            "is_staff",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class AdminUserCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    password_confirm = serializers.CharField(write_only=True, min_length=8, max_length=128)
    role = serializers.ChoiceField(choices=["Customer", "Administrator"])
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    country = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )

    def validate_full_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Full name must be at least 2 characters.")
        return normalized

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate(self, attrs: dict) -> dict:
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )

        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            validate_password(attrs["password"], candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

        return attrs


class AdminUserUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(
        max_length=255,
        required=False,
        trim_whitespace=True,
    )
    phone = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    country = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    role = serializers.ChoiceField(
        choices=["Customer", "Administrator"],
        required=False,
    )
    is_active = serializers.BooleanField(required=False)
    email_verified = serializers.BooleanField(required=False)

    def validate_full_name(self, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise serializers.ValidationError("Full name must be at least 2 characters.")
        return normalized


class ProfileResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="user.id", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    role = serializers.CharField(source="user.role.role_name", read_only=True)
    avatar = serializers.URLField(source="user.avatar", read_only=True, allow_blank=True)
    company_name = serializers.CharField(read_only=True)
    website = serializers.URLField(read_only=True, allow_blank=True)
    address = serializers.CharField(read_only=True)
    city = serializers.CharField(read_only=True)
    country = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class AvatarUploadSerializer(serializers.Serializer):
    avatar = serializers.ImageField(required=True, allow_empty_file=False)

    def validate_avatar(self, value):
        try:
            validate_avatar_upload(value)
        except DjangoValidationError as exc:
            if getattr(exc, "message_dict", None) and "avatar" in exc.message_dict:
                raise serializers.ValidationError(exc.message_dict["avatar"]) from exc
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        return ProfileService.update_avatar(user, validated_data["avatar"])


class ProfileUpdateSerializer(serializers.Serializer):
    company_name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    website = serializers.URLField(required=False, allow_blank=True)
    address = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    city = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    country = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )

    def update(self, instance: UserProfile, validated_data: dict) -> UserProfile:
        return ProfileService.update_profile(
            instance.user,
            ProfileUpdateData(
                company_name=validated_data.get("company_name"),
                website=validated_data.get("website"),
                address=validated_data.get("address"),
                city=validated_data.get("city"),
                country=validated_data.get("country"),
            ),
        )
