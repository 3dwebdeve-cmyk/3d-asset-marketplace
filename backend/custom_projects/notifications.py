"""Email notifications for custom project message threads.

Policy: message create always succeeds even if mail delivery fails.
Failures are logged; emails never include secrets, tokens, or message bodies.
"""

from __future__ import annotations

import logging
from uuid import UUID

from django.conf import settings
from django.core.mail import send_mail

from accounts.models import User
from accounts.services import AuthenticationService
from custom_projects.models import CustomProject, ProjectMessage

logger = logging.getLogger("custom_projects.notifications")


class ProjectMessageNotificationService:
    """Notify the opposite party when a project message is created."""

    @classmethod
    def notify_new_message(cls, message: ProjectMessage) -> None:
        """Send a notification email for a persisted message. Never raises."""
        try:
            project = cls._resolve_project(message)
            if project is None:
                logger.warning(
                    "project_message_email_skipped reason=missing_project message_id=%s",
                    message.pk,
                )
                return

            if message.sender_id == project.customer_id:
                cls._notify_staff_of_customer_message(project, message.pk)
            else:
                cls._notify_customer_of_staff_message(project, message.pk)
        except Exception:
            logger.exception(
                "project_message_email_failed message_id=%s project_id=%s",
                getattr(message, "pk", "-"),
                getattr(getattr(message, "project", None), "pk", "-"),
            )

    @classmethod
    def _resolve_project(cls, message: ProjectMessage) -> CustomProject | None:
        try:
            return CustomProject.objects.select_related(
                "customer",
                "assigned_designer",
                "assigned_designer__role",
            ).get(pk=message.project_id)
        except CustomProject.DoesNotExist:
            return None

    @classmethod
    def _notify_staff_of_customer_message(
        cls,
        project: CustomProject,
        message_id: UUID,
    ) -> None:
        recipients = cls._staff_recipients(project)
        if not recipients:
            logger.warning(
                "project_message_email_skipped reason=no_staff_recipients "
                "project_id=%s message_id=%s",
                project.pk,
                message_id,
            )
            return

        link = cls._admin_project_link(project.pk)
        cls._send(
            subject=f"New customer message on project: {project.title}",
            body=(
                "A customer posted a new message on a custom project.\n\n"
                f"Project: {project.title}\n"
                f"Open the project:\n{link}\n"
            ),
            recipients=recipients,
            project_id=project.pk,
            message_id=message_id,
            direction="customer_to_staff",
        )

    @classmethod
    def _notify_customer_of_staff_message(
        cls,
        project: CustomProject,
        message_id: UUID,
    ) -> None:
        customer = project.customer
        if (
            customer is None
            or not customer.is_active
            or not (customer.email or "").strip()
        ):
            logger.warning(
                "project_message_email_skipped reason=no_customer_recipient "
                "project_id=%s message_id=%s",
                project.pk,
                message_id,
            )
            return

        link = cls._customer_project_link(project.pk)
        cls._send(
            subject=f"New message on your project: {project.title}",
            body=(
                "You have a new message on your custom project.\n\n"
                f"Project: {project.title}\n"
                f"Open the project:\n{link}\n"
            ),
            recipients=[customer.email.strip()],
            project_id=project.pk,
            message_id=message_id,
            direction="staff_to_customer",
        )

    @classmethod
    def _staff_recipients(cls, project: CustomProject) -> list[str]:
        designer = project.assigned_designer
        if (
            designer is not None
            and designer.is_active
            and AuthenticationService.is_administrator(designer)
            and (designer.email or "").strip()
        ):
            return [designer.email.strip()]
        return cls._configured_admin_recipients()

    @classmethod
    def _configured_admin_recipients(cls) -> list[str]:
        raw = getattr(settings, "PROJECT_MESSAGE_ADMIN_RECIPIENTS", "") or ""
        recipients = [part.strip() for part in str(raw).split(",") if part.strip()]
        if recipients:
            return recipients
        return cls._active_administrator_emails()

    @classmethod
    def _active_administrator_emails(cls) -> list[str]:
        emails: list[str] = []
        seen: set[str] = set()
        admins = User.objects.filter(
            is_active=True,
            role__role_name=AuthenticationService.ADMINISTRATOR_ROLE,
        ).exclude(email="").order_by("email")
        for admin in admins.iterator():
            normalized = admin.email.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            emails.append(admin.email.strip())
        return emails

    @staticmethod
    def _frontend_base_url() -> str:
        return getattr(
            settings,
            "FRONTEND_BASE_URL",
            "http://localhost:5173",
        ).rstrip("/")

    @classmethod
    def _admin_project_link(cls, project_id: UUID) -> str:
        return f"{cls._frontend_base_url()}/admin/projects/{project_id}"

    @classmethod
    def _customer_project_link(cls, project_id: UUID) -> str:
        return f"{cls._frontend_base_url()}/dashboard/projects/{project_id}"

    @classmethod
    def _send(
        cls,
        *,
        subject: str,
        body: str,
        recipients: list[str],
        project_id: UUID,
        message_id: UUID,
        direction: str,
    ) -> None:
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
                fail_silently=False,
            )
            logger.info(
                "project_message_email_sent direction=%s project_id=%s "
                "message_id=%s recipient_count=%s",
                direction,
                project_id,
                message_id,
                len(recipients),
            )
        except Exception:
            logger.exception(
                "project_message_email_failed direction=%s project_id=%s "
                "message_id=%s recipient_count=%s",
                direction,
                project_id,
                message_id,
                len(recipients),
            )
