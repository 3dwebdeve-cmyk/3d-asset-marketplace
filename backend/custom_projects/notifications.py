"""Email notifications for custom project workflow events.

Policy: email delivery failures never block a successful project workflow action.
Failures are logged; emails never include secrets, tokens, quote amounts/notes,
message bodies, or storage paths.
"""

from __future__ import annotations

import logging
from uuid import UUID

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from accounts.models import User
from accounts.services import AuthenticationService
from custom_projects.models import CustomProject, ProjectMessage

logger = logging.getLogger("custom_projects.notifications")


class _ProjectEmailSupport:
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

    @classmethod
    def _customer_recipients(cls, project: CustomProject) -> list[str]:
        customer = project.customer
        if (
            customer is None
            or not customer.is_active
            or not (customer.email or "").strip()
        ):
            return []
        return [customer.email.strip()]

    @classmethod
    def _customer_display_name(cls, project: CustomProject) -> str:
        customer = project.customer
        if customer is None:
            return "Customer"
        return (customer.full_name or "").strip() or (customer.email or "Customer")

    @staticmethod
    def _frontend_base_url() -> str:
        return getattr(
            settings,
            "FRONTEND_BASE_URL",
            "http://localhost:5173",
        ).rstrip("/")

    @staticmethod
    def _safe_email_text(value: str) -> str:
        """Collapse whitespace/newlines so values cannot inject email headers."""
        return " ".join(str(value).replace("\r", " ").replace("\n", " ").split())

    @classmethod
    def _admin_project_link(cls, project_id: UUID) -> str:
        return f"{cls._frontend_base_url()}/admin/projects/{project_id}"

    @classmethod
    def _customer_project_link(cls, project_id: UUID) -> str:
        return f"{cls._frontend_base_url()}/dashboard/projects/{project_id}"

    @classmethod
    def _render_body(cls, template_name: str, context: dict[str, str]) -> str:
        return render_to_string(
            f"custom_projects/emails/{template_name}",
            context,
        ).strip() + "\n"

    @classmethod
    def _send(
        cls,
        *,
        subject: str,
        body: str,
        recipients: list[str],
        project_id: UUID,
        event: str,
    ) -> None:
        try:
            send_mail(
                subject=cls._safe_email_text(subject),
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=recipients,
                fail_silently=False,
            )
            logger.info(
                "custom_project_email_sent event=%s project_id=%s recipient_count=%s",
                event,
                project_id,
                len(recipients),
            )
        except Exception:
            logger.exception(
                "custom_project_email_failed event=%s project_id=%s recipient_count=%s",
                event,
                project_id,
                len(recipients),
            )


class ProjectCreationNotificationService(_ProjectEmailSupport):
    """Notify staff when a customer submits a new custom project request."""

    @classmethod
    def notify_new_project(cls, project: CustomProject) -> None:
        try:
            recipients = cls._staff_recipients(project)
            if not recipients:
                logger.warning(
                    "custom_project_email_skipped event=project_created "
                    "reason=no_staff_recipients project_id=%s",
                    project.pk,
                )
                return

            link = cls._admin_project_link(project.pk)
            cls._send(
                subject=f"New custom project request: {project.title}",
                body=cls._render_body(
                    "project_created.txt",
                    {
                        "project_title": cls._safe_email_text(project.title),
                        "customer_name": cls._safe_email_text(
                            cls._customer_display_name(project)
                        ),
                        "project_link": link,
                    },
                ),
                recipients=recipients,
                project_id=project.pk,
                event="project_created",
            )
        except Exception:
            logger.exception(
                "custom_project_email_failed event=project_created project_id=%s",
                getattr(project, "pk", "-"),
            )


class ProjectWorkflowNotificationService(_ProjectEmailSupport):
    """Notify parties for quotation and delivery workflow events."""

    @classmethod
    def notify_quotation_sent(cls, project: CustomProject) -> None:
        try:
            recipients = cls._customer_recipients(project)
            if not recipients:
                logger.warning(
                    "custom_project_email_skipped event=quotation_sent "
                    "reason=no_customer_recipient project_id=%s",
                    project.pk,
                )
                return

            link = cls._customer_project_link(project.pk)
            cls._send(
                subject=f"Quotation ready for your project: {project.title}",
                body=cls._render_body(
                    "quotation_sent.txt",
                    {
                        "project_title": cls._safe_email_text(project.title),
                        "project_link": link,
                    },
                ),
                recipients=recipients,
                project_id=project.pk,
                event="quotation_sent",
            )
        except Exception:
            logger.exception(
                "custom_project_email_failed event=quotation_sent project_id=%s",
                getattr(project, "pk", "-"),
            )

    @classmethod
    def notify_quotation_accepted(cls, project: CustomProject) -> None:
        try:
            recipients = cls._staff_recipients(project)
            if not recipients:
                logger.warning(
                    "custom_project_email_skipped event=quotation_accepted "
                    "reason=no_staff_recipients project_id=%s",
                    project.pk,
                )
                return

            link = cls._admin_project_link(project.pk)
            cls._send(
                subject=f"Quotation accepted: {project.title}",
                body=cls._render_body(
                    "quotation_accepted.txt",
                    {
                        "project_title": cls._safe_email_text(project.title),
                        "customer_name": cls._safe_email_text(
                            cls._customer_display_name(project)
                        ),
                        "project_link": link,
                    },
                ),
                recipients=recipients,
                project_id=project.pk,
                event="quotation_accepted",
            )
        except Exception:
            logger.exception(
                "custom_project_email_failed event=quotation_accepted project_id=%s",
                getattr(project, "pk", "-"),
            )

    @classmethod
    def notify_project_delivered(cls, project: CustomProject) -> None:
        try:
            recipients = cls._customer_recipients(project)
            if not recipients:
                logger.warning(
                    "custom_project_email_skipped event=project_delivered "
                    "reason=no_customer_recipient project_id=%s",
                    project.pk,
                )
                return

            link = cls._customer_project_link(project.pk)
            cls._send(
                subject=f"Deliverables ready: {project.title}",
                body=cls._render_body(
                    "project_delivered.txt",
                    {
                        "project_title": cls._safe_email_text(project.title),
                        "project_link": link,
                    },
                ),
                recipients=recipients,
                project_id=project.pk,
                event="project_delivered",
            )
        except Exception:
            logger.exception(
                "custom_project_email_failed event=project_delivered project_id=%s",
                getattr(project, "pk", "-"),
            )

    @classmethod
    def notify_project_completed(cls, project: CustomProject) -> None:
        try:
            recipients = cls._customer_recipients(project)
            if not recipients:
                logger.warning(
                    "custom_project_email_skipped event=project_completed "
                    "reason=no_customer_recipient project_id=%s",
                    project.pk,
                )
                return

            link = cls._customer_project_link(project.pk)
            cls._send(
                subject=f"Your project is complete: {project.title}",
                body=cls._render_body(
                    "project_completed.txt",
                    {
                        "project_title": cls._safe_email_text(project.title),
                        "project_link": link,
                    },
                ),
                recipients=recipients,
                project_id=project.pk,
                event="project_completed",
            )
        except Exception:
            logger.exception(
                "custom_project_email_failed event=project_completed project_id=%s",
                getattr(project, "pk", "-"),
            )


class ProjectMessageNotificationService(_ProjectEmailSupport):
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
                "custom_project_email_skipped event=message_created reason=no_staff_recipients "
                "project_id=%s message_id=%s",
                project.pk,
                message_id,
            )
            return

        link = cls._admin_project_link(project.pk)
        safe_title = cls._safe_email_text(project.title)
        cls._send(
            subject=f"New customer message on project: {safe_title}",
            body=(
                "A customer posted a new message on a custom project.\n\n"
                f"Project: {safe_title}\n"
                f"Open the project:\n{link}\n"
            ),
            recipients=recipients,
            project_id=project.pk,
            event="message_created_customer_to_staff",
        )

    @classmethod
    def _notify_customer_of_staff_message(
        cls,
        project: CustomProject,
        message_id: UUID,
    ) -> None:
        recipients = cls._customer_recipients(project)
        if not recipients:
            logger.warning(
                "custom_project_email_skipped event=message_created reason=no_customer_recipient "
                "project_id=%s message_id=%s",
                project.pk,
                message_id,
            )
            return

        link = cls._customer_project_link(project.pk)
        safe_title = cls._safe_email_text(project.title)
        cls._send(
            subject=f"New message on your project: {safe_title}",
            body=(
                "You have a new message on your custom project.\n\n"
                f"Project: {safe_title}\n"
                f"Open the project:\n{link}\n"
            ),
            recipients=recipients,
            project_id=project.pk,
            event="message_created_staff_to_customer",
        )
