"""Quotation upsert/accept/pay hooks and resend email."""

from __future__ import annotations

from uuid import UUID

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from accounts.security_log import log_admin_action
from custom_projects.models import CustomProject, ProjectQuotation
from custom_projects.notifications import ProjectWorkflowNotificationService
from custom_projects.service_common import (
    CustomProjectError,
    CustomProjectServiceBase,
    ProjectQuotationData,
)


class QuotationService(CustomProjectServiceBase):
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
    def resend_quotation_email(
        cls,
        project: CustomProject,
        *,
        actor_id: str,
    ) -> CustomProject:
        """Re-enqueue quotation/offer email without changing quotation data."""
        owned = cls.get_for_admin(project.pk)
        try:
            quotation = ProjectQuotation.objects.get(project=owned)
        except ProjectQuotation.DoesNotExist as exc:
            raise CustomProjectError("No quotation exists to resend.") from exc

        if quotation.status not in {
            ProjectQuotation.Status.PENDING,
            ProjectQuotation.Status.ACCEPTED,
        }:
            raise CustomProjectError(
                "Only pending or accepted quotations can be resent.",
                field="status",
            )

        notified_project = CustomProject.objects.select_related(
            "customer",
            "assigned_designer",
            "assigned_designer__role",
        ).get(pk=owned.pk)
        ProjectWorkflowNotificationService.notify_quotation_sent(notified_project)
        log_admin_action(
            action="custom_project_quotation_email_resend",
            actor_id=actor_id,
            target_id=str(owned.pk),
        )
        return notified_project

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
    @transaction.atomic
    def mark_quotation_paid(cls, project_id: UUID) -> CustomProject | None:
        """Mark a custom project paid after successful quotation checkout."""
        try:
            project = CustomProject.objects.select_for_update().get(pk=project_id)
        except CustomProject.DoesNotExist:
            return None

        project.payment_status = CustomProject.PaymentStatus.PAID
        update_fields = ["payment_status", "updated_at"]
        if project.status == CustomProject.Status.APPROVED:
            cls._apply_status(project, CustomProject.Status.IN_PROGRESS)
            update_fields.append("status")
        project.save(update_fields=update_fields)
        return project

    @classmethod
    def revert_quotation_payment_pending(cls, project_id: UUID) -> None:
        """If checkout expired and project is still pending, revert to unpaid."""
        CustomProject.objects.filter(
            pk=project_id,
            payment_status=CustomProject.PaymentStatus.PENDING,
        ).update(
            payment_status=CustomProject.PaymentStatus.UNPAID,
            updated_at=timezone.now(),
        )

    @classmethod
    @transaction.atomic
    def revert_quotation_after_refund(cls, project_id: UUID) -> CustomProject | None:
        """After a full Stripe refund of a quotation order.

        Sets payment_status=unpaid. If status was advanced to in_progress solely
        by payment, revert to approved. Deliverables and quotation rows are kept.
        """
        try:
            project = CustomProject.objects.select_for_update().get(pk=project_id)
        except CustomProject.DoesNotExist:
            return None

        update_fields = ["payment_status", "updated_at"]
        project.payment_status = CustomProject.PaymentStatus.UNPAID
        # Payment-driven rollback is outside the normal workflow graph
        # (IN_PROGRESS → APPROVED is not an admin transition).
        if project.status == CustomProject.Status.IN_PROGRESS:
            project.status = CustomProject.Status.APPROVED
            update_fields.append("status")
        project.save(update_fields=update_fields)
        return project
