import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role_name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "roles"
        ordering = ["role_name"]

    def __str__(self) -> str:
        return self.role_name


class UserManager(BaseUserManager):
    def create_user(
        self,
        email: str,
        full_name: str,
        password: str,
        role: Role,
        phone: str = "",
        country: str = "",
        email_verified: bool = False,
    ) -> "User":
        if not email:
            raise ValueError("Email is required.")
        if not full_name:
            raise ValueError("Full name is required.")
        if not password:
            raise ValueError("Password is required.")

        email = self.normalize_email(email)
        user = self.model(
            email=email,
            full_name=full_name.strip(),
            phone=phone.strip(),
            country=country.strip(),
            role=role,
            email_verified=email_verified,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        email: str,
        full_name: str,
        password: str,
        phone: str = "",
        country: str = "",
    ) -> "User":
        role, _ = Role.objects.get_or_create(
            role_name="Administrator",
            defaults={"description": "Platform administrator"},
        )
        user = self.create_user(
            email=email,
            full_name=full_name,
            password=password,
            role=role,
            phone=phone,
            country=country,
            email_verified=True,
        )
        user.is_staff = True
        user.is_superuser = True
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    google_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)
    avatar = models.URLField(blank=True)
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="users")
    email_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    # Bumped on password change/reset so outstanding access JWTs fail auth.
    token_version = models.PositiveIntegerField(default=0)
    # Administrator TOTP (accounts.mfa). The secret is derived from MFA_SECRET_KEY and
    # this nonce, never stored, so a database copy alone cannot generate codes.
    mfa_nonce = models.CharField(max_length=64, blank=True, default="", editable=False)
    mfa_pending_nonce = models.CharField(max_length=64, blank=True, default="", editable=False)
    mfa_enabled_at = models.DateTimeField(null=True, blank=True, editable=False)
    # Highest time step already accepted; a code cannot be replayed.
    mfa_last_counter = models.BigIntegerField(default=0, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "users"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.email


class UserProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    company_name = models.CharField(max_length=255, blank=True)
    website = models.URLField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_profiles"

    def __str__(self) -> str:
        return f"Profile for {self.user.email}"


class ActivityLog(models.Model):
    """Durable admin audit row. Written fail-soft from log_admin_action."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_logs",
    )
    action = models.CharField(max_length=100, db_index=True)
    target_id = models.CharField(max_length=64, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "activity_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["action", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.action}:{self.target_id or '-'}"


class LegalAcceptance(models.Model):
    """Proof that a user accepted a specific legal document version."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="legal_acceptances",
    )
    document_key = models.CharField(max_length=64, db_index=True)
    version = models.CharField(max_length=64)
    accepted_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "legal_acceptances"
        ordering = ["-accepted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "document_key", "version"],
                name="uniq_legal_acceptance_user_doc_version",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "document_key"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.document_key}:{self.version}"


class AdminRecoveryCode(models.Model):
    """Single-use backup code for an administrator who lost their authenticator."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="recovery_codes")
    # Keyed hash of the code; the code itself is shown once and never stored.
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "admin_recovery_codes"
        constraints = [
            models.UniqueConstraint(fields=["user", "code_hash"], name="uniq_recovery_code_per_user"),
        ]


class KnownDevice(models.Model):
    """A browser that has signed in to the account, for new-device sign-in emails."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="known_devices")
    # SHA-256 of the random device cookie; the cookie value itself is not stored.
    device_hash = models.CharField(max_length=64)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "known_devices"
        constraints = [
            models.UniqueConstraint(fields=["user", "device_hash"], name="uniq_known_device_per_user"),
        ]


class UserSession(models.Model):
    """One signed-in customer device; its id is the ``sid`` claim on that device's JWTs.

    The id survives refresh rotation. A revoked session stops working on its next
    request (``accounts.sessions``).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    # Same SHA-256 as KnownDevice, so signing in again on one browser reuses its slot.
    device_hash = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=32, blank=True)

    class Meta:
        db_table = "user_sessions"
        indexes = [
            models.Index(fields=["user", "revoked_at"]),
        ]


class CatalogApiKey(models.Model):
    """API key for the unattended catalog uploader (``accounts.api_keys``).

    Only a SHA-256 hash of the key is stored; the key itself is shown once at creation.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    # Public part of the key, used to find the row without scanning hashes.
    key_prefix = models.CharField(max_length=16, unique=True)
    key_hash = models.CharField(max_length=64)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="catalog_api_keys")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "catalog_api_keys"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.key_prefix})"
