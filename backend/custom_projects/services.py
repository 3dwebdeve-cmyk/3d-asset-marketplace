from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Max, OuterRef, Prefetch, Q, QuerySet, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounts.models import User
from accounts.services import AuthenticationService
from custom_projects.models import (
    CustomProject,
    ProjectDelivery,
    ProjectFile,
    ProjectMessage,
    ProjectMessageAttachment,
    ProjectMessageReadState,
    ProjectQuotation,
)
from custom_projects.notifications import (
    ProjectCreationNotificationService,
    ProjectMessageNotificationService,
    ProjectWorkflowNotificationService,
)
from custom_projects.storage import (
    ProjectDeliveryStorageService,
    ProjectFileStorageService,
    ProjectMessageAttachmentStorageService,
)
from custom_projects.upload_rules import ValidatedProjectFileUpload

# Sentinel so messages with no prior read state all count as unread.
_UNREAD_EPOCH = datetime(1970, 1, 1, tzinfo=dt_timezone.utc)


class CustomProjectError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


ALLOWED_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    CustomProject.Status.SUBMITTED: frozenset(
        {
            CustomProject.Status.UNDER_REVIEW,
            CustomProject.Status.REJECTED,
            CustomProject.Status.CANCELLED,
        }
    ),
    CustomProject.Status.UNDER_REVIEW: frozenset(
        {
            CustomProject.Status.QUOTED,
            CustomProject.Status.REJECTED,
            CustomProject.Status.CANCELLED,
        }
    ),
    CustomProject.Status.QUOTED: frozenset(
        {
            CustomProject.Status.APPROVED,
            CustomProject.Status.REJECTED,
            CustomProject.Status.CANCELLED,
            CustomProject.Status.UNDER_REVIEW,
        }
    ),
    CustomProject.Status.APPROVED: frozenset(
        {
            CustomProject.Status.IN_PROGRESS,
            CustomProject.Status.CANCELLED,
        }
    ),
    CustomProject.Status.IN_PROGRESS: frozenset(
        {
            CustomProject.Status.DELIVERED,
            CustomProject.Status.CANCELLED,
        }
    ),
    CustomProject.Status.DELIVERED: frozenset(
        {
            CustomProject.Status.COMPLETED,
            CustomProject.Status.IN_PROGRESS,
        }
    ),
    CustomProject.Status.COMPLETED: frozenset(),
    CustomProject.Status.REJECTED: frozenset(),
    CustomProject.Status.CANCELLED: frozenset(),
}


@dataclass(frozen=True)
class CustomProjectCreateData:
    customer_id: UUID
    title: str
    description: str
    category: str = ""
    estimated_budget: Decimal | None = None
    currency: str = "USD"
    deadline: date | None = None


@dataclass(frozen=True)
class CustomProjectUpdateData:
    title: str | None = None
    description: str | None = None
    category: str | None = None
    estimated_budget: Decimal | None = None
    clear_estimated_budget: bool = False
    currency: str | None = None
    deadline: date | None = None
    clear_deadline: bool = False
    status: str | None = None
    assigned_designer_id: UUID | None = None
    clear_assigned_designer: bool = False
    payment_status: str | None = None
    admin_notes: str | None = None


@dataclass(frozen=True)
class ProjectQuotationData:
    amount: Decimal
    currency: str = "USD"
    estimated_delivery: date | None = None
    notes: str = ""
    status: str = ProjectQuotation.Status.PENDING


class CustomProjectService:
    @classmethod
    def get_detail_queryset(cls) -> QuerySet[CustomProject]:
        return CustomProject.objects.select_related(
            "customer",
            "assigned_designer",
            "quotation",
        ).prefetch_related(
            Prefetch(
                "files",
                queryset=ProjectFile.objects.select_related("uploaded_by").order_by(
                    "created_at"
                ),
            )
        )

    @classmethod
    def list_admin(
        cls,
        *,
        viewer: User,
        search: str | None = None,
        status: str | None = None,
        payment_status: str | None = None,
        customer_id: UUID | None = None,
        ordering: str = "-created_at",
    ) -> QuerySet[CustomProject]:
        queryset = CustomProject.objects.select_related(
            "customer",
            "assigned_designer",
            "quotation",
        )
        if status:
            queryset = queryset.filter(status=status)
        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if search and search.strip():
            query = search.strip()[:100]
            queryset = queryset.filter(
                Q(title__icontains=query)
                | Q(description__icontains=query)
                | Q(category__icontains=query)
                | Q(customer__email__icontains=query)
                | Q(customer__full_name__icontains=query)
            )
        allowed_ordering = {
            "created_at",
            "-created_at",
            "updated_at",
            "-updated_at",
            "title",
            "-title",
            "deadline",
            "-deadline",
            "status",
            "-status",
        }
        if ordering not in allowed_ordering:
            ordering = "-created_at"
        return cls.annotate_unread_counts(queryset, viewer).order_by(ordering)

    @classmethod
    def list_for_customer(cls, customer: User) -> QuerySet[CustomProject]:
        queryset = CustomProject.objects.filter(customer=customer).select_related(
            "quotation",
            "assigned_designer",
        )
        return cls.annotate_unread_counts(queryset, customer).order_by("-created_at")

    @classmethod
    def annotate_unread_counts(
        cls,
        queryset: QuerySet[CustomProject],
        viewer: User,
    ) -> QuerySet[CustomProject]:
        """Annotate unread_count: messages from others after the viewer's last_read_at."""
        last_read_subquery = ProjectMessageReadState.objects.filter(
            project_id=OuterRef("pk"),
            user_id=viewer.id,
        ).values("last_read_at")[:1]
        return queryset.annotate(
            _viewer_last_read_at=Coalesce(
                Subquery(last_read_subquery),
                Value(_UNREAD_EPOCH),
            ),
            unread_count=Count(
                "messages",
                filter=Q(messages__created_at__gt=F("_viewer_last_read_at"))
                & ~Q(messages__sender_id=viewer.id),
                distinct=True,
            ),
        )

    @classmethod
    def get_for_admin(cls, project_id: UUID) -> CustomProject:
        try:
            return cls.get_detail_queryset().get(pk=project_id)
        except CustomProject.DoesNotExist as exc:
            raise CustomProjectError("Custom project not found.") from exc

    @classmethod
    def get_for_customer(cls, project_id: UUID, customer: User) -> CustomProject:
        try:
            return cls.get_detail_queryset().get(pk=project_id, customer=customer)
        except CustomProject.DoesNotExist as exc:
            raise CustomProjectError("Custom project not found.") from exc

    @classmethod
    def create(
        cls,
        data: CustomProjectCreateData,
        *,
        notify_staff_on_create: bool = False,
    ) -> CustomProject:
        customer = cls._require_customer(data.customer_id)
        title = " ".join(data.title.strip().split())
        description = data.description.strip()
        if len(title) < 3:
            raise CustomProjectError(
                "Title must be at least 3 characters.",
                field="title",
            )
        if len(description) < 10:
            raise CustomProjectError(
                "Description must be at least 10 characters.",
                field="description",
            )
        with transaction.atomic():
            project = CustomProject.objects.create(
                customer=customer,
                title=title,
                description=description,
                category=data.category.strip(),
                estimated_budget=data.estimated_budget,
                currency=(data.currency or "USD").strip().upper()[:3],
                deadline=data.deadline,
                status=CustomProject.Status.SUBMITTED,
                payment_status=CustomProject.PaymentStatus.UNPAID,
            )
        if notify_staff_on_create:
            # Outside the write transaction so SMTP latency/failures cannot roll back create.
            ProjectCreationNotificationService.notify_new_project(project)
        return project

    @classmethod
    def update_admin(
        cls,
        project: CustomProject,
        data: CustomProjectUpdateData,
    ) -> CustomProject:
        previous_status = project.status
        with transaction.atomic():
            if data.title is not None:
                title = " ".join(data.title.strip().split())
                if len(title) < 3:
                    raise CustomProjectError(
                        "Title must be at least 3 characters.",
                        field="title",
                    )
                project.title = title
            if data.description is not None:
                description = data.description.strip()
                if len(description) < 10:
                    raise CustomProjectError(
                        "Description must be at least 10 characters.",
                        field="description",
                    )
                project.description = description
            if data.category is not None:
                project.category = data.category.strip()
            if data.clear_estimated_budget:
                project.estimated_budget = None
            elif data.estimated_budget is not None:
                project.estimated_budget = data.estimated_budget
            if data.currency is not None:
                project.currency = data.currency.strip().upper()[:3]
            if data.clear_deadline:
                project.deadline = None
            elif data.deadline is not None:
                project.deadline = data.deadline
            if data.status is not None:
                cls._apply_status(project, data.status)
            if data.clear_assigned_designer:
                project.assigned_designer = None
            elif data.assigned_designer_id is not None:
                project.assigned_designer = cls._require_administrator(
                    data.assigned_designer_id
                )
            if data.payment_status is not None:
                if data.payment_status not in CustomProject.PaymentStatus.values:
                    raise CustomProjectError("Invalid payment status.", field="payment_status")
                project.payment_status = data.payment_status
            if data.admin_notes is not None:
                project.admin_notes = data.admin_notes.strip()
            project.save()
            updated = cls.get_for_admin(project.id)
        if (
            previous_status != CustomProject.Status.DELIVERED
            and updated.status == CustomProject.Status.DELIVERED
        ):
            # Outside the write transaction so SMTP latency/failures cannot roll back status.
            ProjectWorkflowNotificationService.notify_project_delivered(updated)
        return updated

    @classmethod
    def upsert_quotation(
        cls,
        project: CustomProject,
        data: ProjectQuotationData,
    ) -> ProjectQuotation:
        if data.amount < 0:
            raise CustomProjectError(
                "Quotation amount cannot be negative.",
                field="amount",
            )
        if data.status not in ProjectQuotation.Status.values:
            raise CustomProjectError("Invalid quotation status.", field="status")

        with transaction.atomic():
            quotation, created = ProjectQuotation.objects.update_or_create(
                project=project,
                defaults={
                    "amount": data.amount,
                    "currency": (data.currency or "USD").strip().upper()[:3],
                    "estimated_delivery": data.estimated_delivery,
                    "notes": data.notes.strip(),
                    "status": data.status,
                },
            )
            became_quoted = False
            if project.status in {
                CustomProject.Status.SUBMITTED,
                CustomProject.Status.UNDER_REVIEW,
            }:
                project.status = CustomProject.Status.QUOTED
                project.save(update_fields=["status", "updated_at"])
                became_quoted = True

            notified_project = CustomProject.objects.select_related(
                "customer",
                "assigned_designer",
                "assigned_designer__role",
            ).get(pk=project.pk)

        # Notify once when a quote is first created or the project first becomes quoted.
        # Subsequent quote edits must not spam the customer.
        if created or became_quoted:
            ProjectWorkflowNotificationService.notify_quotation_sent(notified_project)
        return quotation

    @classmethod
    def accept_quotation(
        cls,
        project: CustomProject,
        *,
        customer: User,
    ) -> ProjectQuotation:
        """Customer accepts a pending quotation and moves the project to approved."""
        owned = cls.get_for_customer(project.id, customer)
        with transaction.atomic():
            try:
                quotation = ProjectQuotation.objects.select_for_update().get(project=owned)
            except ProjectQuotation.DoesNotExist as exc:
                raise CustomProjectError("No quotation is available to accept.") from exc

            if quotation.status != ProjectQuotation.Status.PENDING:
                raise CustomProjectError(
                    "Only a pending quotation can be accepted.",
                    field="status",
                )
            if owned.status != CustomProject.Status.QUOTED:
                raise CustomProjectError(
                    "Quotation can only be accepted when the project is quoted.",
                    field="status",
                )

            quotation.status = ProjectQuotation.Status.ACCEPTED
            quotation.save(update_fields=["status", "updated_at"])
            cls._apply_status(owned, CustomProject.Status.APPROVED)
            owned.save(update_fields=["status", "updated_at"])

            notified_project = CustomProject.objects.select_related(
                "customer",
                "assigned_designer",
                "assigned_designer__role",
            ).get(pk=owned.pk)
            accepted = (
                ProjectQuotation.objects.select_related("project")
                .get(pk=quotation.pk)
            )

        # Outside the write transaction so SMTP latency/failures cannot roll back accept.
        ProjectWorkflowNotificationService.notify_quotation_accepted(notified_project)
        return accepted

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
        cursor = last_read_at or _UNREAD_EPOCH
        return (
            ProjectMessage.objects.filter(project=project, created_at__gt=cursor)
            .exclude(sender_id=user.id)
            .count()
        )

    @classmethod
    @transaction.atomic
    def add_file(
        cls,
        project: CustomProject,
        *,
        uploaded_by: User,
        validated: ValidatedProjectFileUpload,
        file_type: str,
    ) -> ProjectFile:
        if file_type not in ProjectFile.FileType.values:
            raise CustomProjectError("Invalid file type.", field="file_type")
        if project.status in {
            CustomProject.Status.COMPLETED,
            CustomProject.Status.REJECTED,
            CustomProject.Status.CANCELLED,
        }:
            raise CustomProjectError(
                "Reference files cannot be added to a closed project."
            )

        storage_path = ProjectFileStorageService.save_file(
            str(project.id),
            validated.file,
            validated.extension,
        )
        return ProjectFile.objects.create(
            project=project,
            uploaded_by=uploaded_by,
            file_type=file_type,
            file_name=Path(validated.file.name or "upload.bin").name[:255],
            storage_path=storage_path,
            file_size=int(getattr(validated.file, "size", 0) or 0),
        )

    @classmethod
    def list_deliveries(cls, project: CustomProject) -> QuerySet[ProjectDelivery]:
        return (
            ProjectDelivery.objects.filter(project=project)
            .select_related("uploaded_by")
            .order_by("-version", "-created_at")
        )

    @classmethod
    def get_delivery_for_admin(
        cls,
        *,
        project_id: UUID,
        delivery_id: UUID,
    ) -> ProjectDelivery:
        cls.get_for_admin(project_id)
        try:
            return ProjectDelivery.objects.select_related("uploaded_by", "project").get(
                pk=delivery_id,
                project_id=project_id,
            )
        except ProjectDelivery.DoesNotExist as exc:
            raise CustomProjectError("Delivery not found.") from exc

    @classmethod
    def get_delivery_for_customer(
        cls,
        *,
        project_id: UUID,
        delivery_id: UUID,
        customer: User,
    ) -> ProjectDelivery:
        cls.get_for_customer(project_id, customer)
        try:
            return ProjectDelivery.objects.select_related("uploaded_by", "project").get(
                pk=delivery_id,
                project_id=project_id,
            )
        except ProjectDelivery.DoesNotExist as exc:
            raise CustomProjectError("Delivery not found.") from exc

    @classmethod
    @transaction.atomic
    def create_delivery(
        cls,
        project: CustomProject,
        *,
        uploaded_by: User,
        validated: ValidatedProjectFileUpload,
        notes: str = "",
        version: int | None = None,
    ) -> ProjectDelivery:
        """Admin-only deliverable upload. Version defaults to next unused integer."""
        locked = CustomProject.objects.select_for_update().get(pk=project.pk)
        if version is None:
            current_max = (
                ProjectDelivery.objects.filter(project=locked)
                .aggregate(max_version=Max("version"))
                .get("max_version")
            )
            resolved_version = int(current_max or 0) + 1
        else:
            if version < 1:
                raise CustomProjectError(
                    "Version must be a positive integer.",
                    field="version",
                )
            resolved_version = version

        storage_path = ProjectDeliveryStorageService.save_file(
            str(locked.id),
            validated.file,
            validated.extension,
        )
        try:
            with transaction.atomic():
                delivery = ProjectDelivery.objects.create(
                    project=locked,
                    uploaded_by=uploaded_by,
                    file_name=Path(validated.file.name or "upload.bin").name[:255],
                    storage_path=storage_path,
                    file_size=int(getattr(validated.file, "size", 0) or 0),
                    version=resolved_version,
                    notes=(notes or "").strip(),
                )
        except IntegrityError as exc:
            ProjectDeliveryStorageService.delete_if_managed(
                storage_path,
                prefix=ProjectDeliveryStorageService.FILE_PREFIX,
            )
            raise CustomProjectError(
                "A delivery with this version already exists for the project.",
                field="version",
            ) from exc

        CustomProject.objects.filter(pk=locked.pk).update(
            updated_at=delivery.created_at,
        )
        return delivery

    @classmethod
    def _apply_status(cls, project: CustomProject, new_status: str) -> None:
        if new_status not in CustomProject.Status.values:
            raise CustomProjectError("Invalid status.", field="status")
        if new_status == project.status:
            return
        allowed = ALLOWED_STATUS_TRANSITIONS.get(project.status, frozenset())
        if new_status not in allowed:
            raise CustomProjectError(
                f"Cannot transition from {project.status} to {new_status}.",
                field="status",
            )
        if new_status == CustomProject.Status.QUOTED:
            if not ProjectQuotation.objects.filter(project_id=project.id).exists():
                raise CustomProjectError(
                    "Set a quotation before marking the project as quoted.",
                    field="status",
                )
        project.status = new_status

    @classmethod
    def _require_customer(cls, user_id: UUID) -> User:
        try:
            user = User.objects.select_related("role").get(pk=user_id)
        except User.DoesNotExist as exc:
            raise CustomProjectError("Customer not found.", field="customer_id") from exc
        if not user.is_active:
            raise CustomProjectError("Customer is inactive.", field="customer_id")
        if AuthenticationService.is_administrator(user):
            raise CustomProjectError(
                "Administrator accounts cannot be project customers.",
                field="customer_id",
            )
        return user

    @classmethod
    def _require_administrator(cls, user_id: UUID) -> User:
        try:
            user = User.objects.select_related("role").get(pk=user_id)
        except User.DoesNotExist as exc:
            raise CustomProjectError(
                "Assigned designer not found.",
                field="assigned_designer_id",
            ) from exc
        if not user.is_active or not AuthenticationService.is_administrator(user):
            raise CustomProjectError(
                "Assigned designer must be an active administrator.",
                field="assigned_designer_id",
            )
        return user
