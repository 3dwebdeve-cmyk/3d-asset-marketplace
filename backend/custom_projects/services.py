from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from django.db import transaction
from django.db.models import Prefetch, Q, QuerySet

from accounts.models import User
from accounts.services import AuthenticationService
from custom_projects.models import (
    CustomProject,
    ProjectFile,
    ProjectMessage,
    ProjectQuotation,
)
from custom_projects.storage import ProjectFileStorageService
from custom_projects.upload_rules import ValidatedProjectFileUpload


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
        return queryset.order_by(ordering)

    @classmethod
    def list_for_customer(cls, customer: User) -> QuerySet[CustomProject]:
        return (
            CustomProject.objects.filter(customer=customer)
            .select_related("quotation", "assigned_designer")
            .order_by("-created_at")
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
    @transaction.atomic
    def create(cls, data: CustomProjectCreateData) -> CustomProject:
        customer = cls._require_customer(data.customer_id)
        title = data.title.strip()
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
        return CustomProject.objects.create(
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

    @classmethod
    @transaction.atomic
    def update_admin(
        cls,
        project: CustomProject,
        data: CustomProjectUpdateData,
    ) -> CustomProject:
        if data.title is not None:
            title = data.title.strip()
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
        return cls.get_for_admin(project.id)

    @classmethod
    @transaction.atomic
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

        quotation, _created = ProjectQuotation.objects.update_or_create(
            project=project,
            defaults={
                "amount": data.amount,
                "currency": (data.currency or "USD").strip().upper()[:3],
                "estimated_delivery": data.estimated_delivery,
                "notes": data.notes.strip(),
                "status": data.status,
            },
        )
        if project.status in {
            CustomProject.Status.SUBMITTED,
            CustomProject.Status.UNDER_REVIEW,
        }:
            project.status = CustomProject.Status.QUOTED
            project.save(update_fields=["status", "updated_at"])
        return quotation

    @classmethod
    def list_messages(cls, project: CustomProject) -> QuerySet[ProjectMessage]:
        return (
            ProjectMessage.objects.filter(project=project)
            .select_related("sender")
            .order_by("created_at")
        )

    @classmethod
    @transaction.atomic
    def create_message(
        cls,
        project: CustomProject,
        *,
        sender: User,
        body: str,
    ) -> ProjectMessage:
        normalized = body.strip()
        if not normalized:
            raise CustomProjectError("Message body cannot be empty.", field="body")
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
        CustomProject.objects.filter(pk=project.pk).update(
            updated_at=message.created_at,
        )
        return (
            ProjectMessage.objects.select_related("sender").get(pk=message.pk)
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
