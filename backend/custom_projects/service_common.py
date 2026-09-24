"""Shared types and helpers for custom-project domain services."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from uuid import UUID

from django.db.models import Prefetch, QuerySet

from accounts.models import User
from accounts.services import AuthenticationService
from custom_projects.models import CustomProject, ProjectDelivery, ProjectFile, ProjectQuotation

# Sentinel so messages with no prior read state all count as unread.
UNREAD_EPOCH = datetime(1970, 1, 1, tzinfo=dt_timezone.utc)


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


class CustomProjectServiceBase:
    """Shared queryset/status helpers used by domain mixins."""

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
        if new_status == CustomProject.Status.COMPLETED:
            if not ProjectDelivery.objects.filter(project_id=project.id).exists():
                raise CustomProjectError(
                    "At least one delivery must be uploaded before marking the project as completed.",
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
