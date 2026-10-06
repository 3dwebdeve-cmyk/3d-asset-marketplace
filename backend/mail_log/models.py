from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class BackgroundJob(models.Model):
    """Transactional outbox. Only the application can create task payloads."""

    task_name = models.CharField(max_length=255)
    args = models.JSONField(default=list)
    kwargs = models.JSONField(default=dict)
    status = models.CharField(max_length=16, default="queued", db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    available_at = models.DateTimeField(default=timezone.now, db_index=True)
    lease_id = models.UUIDField(null=True)
    lease_until = models.DateTimeField(null=True)
    started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class BackgroundWorker(models.Model):
    """Per-process heartbeat; retained briefly for worker diagnostics."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    started_at = models.DateTimeField(auto_now_add=True)
    heartbeat_at = models.DateTimeField(default=timezone.now, db_index=True)
    current_job_id = models.BigIntegerField(null=True, blank=True)


class OutboundEmailLog(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    class EventType(models.TextChoices):
        PROJECT_CREATED = "project_created", "Project created"
        QUOTATION_SENT = "quotation_sent", "Quotation sent"
        QUOTATION_ACCEPTED = "quotation_accepted", "Quotation accepted"
        PROJECT_DELIVERED = "project_delivered", "Project delivered"
        PROJECT_COMPLETED = "project_completed", "Project completed"
        MESSAGE_CUSTOMER_TO_STAFF = (
            "message_created_customer_to_staff",
            "Message customer → staff",
        )
        MESSAGE_STAFF_TO_CUSTOMER = (
            "message_created_staff_to_customer",
            "Message staff → customer",
        )
        PAYMENT_RECEIPT = "payment_receipt", "Payment receipt"
        EMAIL_VERIFICATION = "email_verification", "Email verification"
        PASSWORD_RESET = "password_reset", "Password reset"
        PASSWORD_CHANGED = "password_changed", "Password changed"
        CONTACT_SUBMISSION = "contact_submission", "Contact submission"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_type = models.CharField(max_length=64, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    # sha256:<12 hex> — never store cleartext recipient addresses
    recipient_hash = models.CharField(max_length=64, blank=True, default="")
    related_object_type = models.CharField(max_length=64, blank=True, default="")
    related_object_id = models.CharField(max_length=64, blank=True, default="")
    subject = models.CharField(max_length=255, blank=True, default="")
    error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "outbound_email_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["related_object_type", "related_object_id"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.event_type}:{self.status}:{self.pk}"
