"""Project messages, attachments, and read-state helpers."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from accounts.models import User
from custom_projects.models import (
    CustomProject,
    ProjectMessage,
    ProjectMessageAttachment,
    ProjectMessageReadState,
)
from custom_projects.notifications import ProjectMessageNotificationService
from custom_projects.service_common import (
    UNREAD_EPOCH,
    CustomProjectError,
    CustomProjectServiceBase,
)
from custom_projects.storage import ProjectMessageAttachmentStorageService
from custom_projects.upload_rules import ValidatedProjectFileUpload


class MessageService(CustomProjectServiceBase):
    @classmethod
    def list_messages(cls, project: CustomProject) -> QuerySet[ProjectMessage]:
        return (
            ProjectMessage.objects.filter(project=project)
            .select_related("sender")
            .prefetch_related("attachments")
            .order_by("created_at")
        )

    @classmethod
    def create_message(
        cls,
        project: CustomProject,
        *,
        sender: User,
        body: str,
        attachment: ValidatedProjectFileUpload | None = None,
    ) -> ProjectMessage:
        message = cls._persist_message(
            project,
            sender=sender,
            body=body,
            attachment=attachment,
        )
        # Mail failures must not undo a successful message create.
        ProjectMessageNotificationService.notify_new_message(message)
        return message

    @classmethod
    @transaction.atomic
    def _persist_message(
        cls,
        project: CustomProject,
        *,
        sender: User,
        body: str,
        attachment: ValidatedProjectFileUpload | None = None,
    ) -> ProjectMessage:
        normalized = body.strip()
        if not normalized and attachment is None:
            raise CustomProjectError(
                "Provide a message body or an attachment.",
                field="body",
            )
        if len(normalized) > ProjectMessage.BODY_MAX_LENGTH:
            raise CustomProjectError(
                f"Message body cannot exceed {ProjectMessage.BODY_MAX_LENGTH} characters.",
                field="body",
            )
        message = ProjectMessage.objects.create(
            project=project,
            sender=sender,
            body=normalized,
        )
        if attachment is not None:
            storage_path = ProjectMessageAttachmentStorageService.save_file(
                str(project.id),
                attachment.file,
                attachment.extension,
            )
            ProjectMessageAttachment.objects.create(
                message=message,
                file_name=Path(attachment.file.name or "upload.bin").name[:255],
                storage_path=storage_path,
                file_size=int(getattr(attachment.file, "size", 0) or 0),
            )
        CustomProject.objects.filter(pk=project.pk).update(
            updated_at=message.created_at,
        )
        return (
            ProjectMessage.objects.select_related("sender")
            .prefetch_related("attachments")
            .get(pk=message.pk)
        )

    @classmethod
    def get_message_attachment_for_customer(
        cls,
        *,
        project_id: UUID,
        message_id: UUID,
        attachment_id: UUID,
        customer: User,
    ) -> ProjectMessageAttachment:
        cls.get_for_customer(project_id, customer)
        try:
            return ProjectMessageAttachment.objects.select_related(
                "message",
                "message__project",
            ).get(
                pk=attachment_id,
                message_id=message_id,
                message__project_id=project_id,
            )
        except ProjectMessageAttachment.DoesNotExist as exc:
            raise CustomProjectError("Attachment not found.") from exc

    @classmethod
    def get_message_attachment_for_admin(
        cls,
        *,
        project_id: UUID,
        message_id: UUID,
        attachment_id: UUID,
    ) -> ProjectMessageAttachment:
        cls.get_for_admin(project_id)
        try:
            return ProjectMessageAttachment.objects.select_related(
                "message",
                "message__project",
            ).get(
                pk=attachment_id,
                message_id=message_id,
                message__project_id=project_id,
            )
        except ProjectMessageAttachment.DoesNotExist as exc:
            raise CustomProjectError("Attachment not found.") from exc

    @classmethod
    @transaction.atomic
    def mark_messages_read(
        cls,
        project: CustomProject,
        *,
        user: User,
    ) -> ProjectMessageReadState:
        """Advance the user's last-read cursor for this project thread."""
        now = timezone.now()
        state, _created = ProjectMessageReadState.objects.update_or_create(
            project=project,
            user=user,
            defaults={"last_read_at": now},
        )
        return state

    @classmethod
    def get_unread_count(cls, project: CustomProject, user: User) -> int:
        last_read_at = (
            ProjectMessageReadState.objects.filter(project=project, user=user)
            .values_list("last_read_at", flat=True)
            .first()
        )
        cursor = last_read_at or UNREAD_EPOCH
        return (
            ProjectMessage.objects.filter(project=project, created_at__gt=cursor)
            .exclude(sender_id=user.id)
            .count()
        )
