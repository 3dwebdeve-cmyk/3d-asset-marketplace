"""Custom-project delivery upload and lookup helpers."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Max, QuerySet

from accounts.models import User
from custom_projects.models import CustomProject, ProjectDelivery
from custom_projects.service_common import CustomProjectError, CustomProjectServiceBase
from custom_projects.storage import ProjectDeliveryStorageService
from custom_projects.upload_rules import ValidatedProjectFileUpload


class DeliveryService(CustomProjectServiceBase):
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
