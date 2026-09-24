"""Custom project create/list/update and reference-file helpers."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from django.db import transaction
from django.db.models import Count, F, OuterRef, Q, QuerySet, Subquery, Value
from django.db.models.functions import Coalesce

from accounts.models import User
from custom_projects.models import (
    CustomProject,
    ProjectFile,
    ProjectMessageReadState,
)
from custom_projects.notifications import (
    ProjectCreationNotificationService,
    ProjectWorkflowNotificationService,
)
from custom_projects.service_common import (
    UNREAD_EPOCH,
    CustomProjectCreateData,
    CustomProjectError,
    CustomProjectServiceBase,
    CustomProjectUpdateData,
)
from custom_projects.storage import ProjectFileStorageService
from custom_projects.upload_rules import ValidatedProjectFileUpload


class ProjectService(CustomProjectServiceBase):
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
                Value(UNREAD_EPOCH),
            ),
            unread_count=Count(
                "messages",
                filter=Q(messages__created_at__gt=F("_viewer_last_read_at"))
                & ~Q(messages__sender_id=viewer.id),
                distinct=True,
            ),
        )

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
        if (
            previous_status != CustomProject.Status.COMPLETED
            and updated.status == CustomProject.Status.COMPLETED
        ):
            ProjectWorkflowNotificationService.notify_project_completed(updated)
        return updated

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
    @transaction.atomic
    def delete_file(
        cls,
        project: CustomProject,
        *,
        file_id: UUID,
        customer: User,
    ) -> None:
        """Customer deletes one of their own reference files from an open project."""
        if project.status in {
            CustomProject.Status.COMPLETED,
            CustomProject.Status.REJECTED,
            CustomProject.Status.CANCELLED,
        }:
            raise CustomProjectError(
                "Reference files cannot be deleted from a closed project."
            )
        try:
            project_file = ProjectFile.objects.get(pk=file_id, project=project)
        except ProjectFile.DoesNotExist as exc:
            raise CustomProjectError("Reference file not found.") from exc
        storage_url = project_file.storage_path
        project_file.delete()
        ProjectFileStorageService.delete_if_managed(
            storage_url,
            prefix=ProjectFileStorageService.FILE_PREFIX,
        )
