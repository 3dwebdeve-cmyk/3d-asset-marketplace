import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from config.validators import validate_storage_path


class CustomProject(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under review"
        QUOTED = "quoted", "Quoted"
        APPROVED = "approved", "Approved"
        IN_PROGRESS = "in_progress", "In progress"
        DELIVERED = "delivered", "Delivered"
        COMPLETED = "completed", "Completed"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        REFUNDED = "refunded", "Refunded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="custom_projects",
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=120, blank=True)
    estimated_budget = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="USD")
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.SUBMITTED,
        db_index=True,
    )
    assigned_designer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_custom_projects",
    )
    payment_status = models.CharField(
        max_length=32,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True,
    )
    admin_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_projects"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["payment_status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["title"]),
        ]

    def __str__(self) -> str:
        return self.title


class ProjectFile(models.Model):
    class FileType(models.TextChoices):
        REFERENCE_IMAGE = "reference_image", "Reference image"
        CAD_DRAWING = "cad_drawing", "CAD drawing"
        SKETCH = "sketch", "Sketch"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        CustomProject,
        on_delete=models.CASCADE,
        related_name="files",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="custom_project_files",
    )
    file_type = models.CharField(
        max_length=32,
        choices=FileType.choices,
        default=FileType.OTHER,
    )
    file_name = models.CharField(max_length=255)
    storage_path = models.CharField(max_length=512, validators=[validate_storage_path])
    file_size = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_project_files"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["file_type"]),
        ]

    def __str__(self) -> str:
        return self.file_name


class ProjectDelivery(models.Model):
    """Final deliverable uploaded for a custom project (separate from reference files)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        CustomProject,
        on_delete=models.CASCADE,
        related_name="deliveries",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="custom_project_deliveries",
    )
    file_name = models.CharField(max_length=255)
    storage_path = models.CharField(max_length=512, validators=[validate_storage_path])
    file_size = models.PositiveBigIntegerField(default=0)
    version = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_project_deliveries"
        ordering = ["-version", "-created_at"]
        indexes = [
            models.Index(fields=["project", "version"]),
            models.Index(fields=["project", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "version"],
                name="uniq_custom_project_delivery_version",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.file_name} (v{self.version})"


class ProjectQuotation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.OneToOneField(
        CustomProject,
        on_delete=models.CASCADE,
        related_name="quotation",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=3, default="USD")
    estimated_delivery = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_project_quotations"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Quote {self.amount} {self.currency} for {self.project_id}"


class ProjectMessage(models.Model):
    """Shared project thread message between customer and administrators."""

    BODY_MAX_LENGTH = 5000

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        CustomProject,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="custom_project_messages",
    )
    body = models.TextField(max_length=BODY_MAX_LENGTH, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_project_messages"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["project", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"Message {self.id} on {self.project_id}"


class ProjectMessageAttachment(models.Model):
    """File attached to a project message (private; download via authenticated API)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        ProjectMessage,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file_name = models.CharField(max_length=255)
    storage_path = models.CharField(max_length=512, validators=[validate_storage_path])
    file_size = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_project_message_attachments"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["message", "created_at"]),
        ]

    def __str__(self) -> str:
        return self.file_name


class ProjectMessageReadState(models.Model):
    """Per-user last-read cursor for a custom project message thread."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        CustomProject,
        on_delete=models.CASCADE,
        related_name="message_read_states",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="custom_project_message_read_states",
    )
    last_read_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "custom_project_message_read_states"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "user"],
                name="uniq_custom_project_message_read_state",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "last_read_at"]),
            models.Index(fields=["project", "user"]),
        ]

    def __str__(self) -> str:
        return f"Read state {self.user_id} on {self.project_id}"
