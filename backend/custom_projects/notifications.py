"""Email notifications for custom project workflow events.

Policy: email delivery failures never block a successful project workflow action.
Emails are enqueued on Celery after DB commit. Failures are logged; emails never
include secrets, tokens, quote amounts/notes, message bodies, or storage paths.
"""

from __future__ import annotations

import logging
from uuid import UUID

from django.conf import settings

from accounts.models import User
from accounts.services import AuthenticationService
from config.celery_utils import enqueue_after_commit
from config.mail import frontend_base_url, render_text_email, safe_email_text, send_text_mail
from custom_projects.models import CustomProject, ProjectMessage
from mail_log.services import MailLogService

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
        return frontend_base_url()

    @staticmethod
    def _safe_email_text(value: str) -> str:
        return safe_email_text(value)

    @classmethod
    def _admin_project_link(cls, project_id: UUID) -> str:
        return f"{cls._frontend_base_url()}/admin/projects/{project_id}"

    @classmethod
    def _customer_project_link(cls, project_id: UUID) -> str:
        return f"{cls._frontend_base_url()}/dashboard/projects/{project_id}"

    @classmethod
    def _render_body(cls, template_name: str, context: dict[str, str]) -> str:
        return render_text_email(
            f"custom_projects/emails/{template_name}",
            context,
        )

    @classmethod
    def _skip(
        cls,
        *,
        event: str,
        reason: str,
        project_id: UUID,
        subject: str = "",
    ) -> None:
        logger.warning(
            "custom_project_email_skipped event=%s reason=%s project_id=%s",
            event,
            reason,
            project_id,
        )
        MailLogService.record_skipped(
            event_type=event,
            reason=reason,
            related_object_type="custom_project",
            related_object_id=str(project_id),
            subject=subject,
        )

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
        """Deliver email now. Raises on SMTP failure for Celery retries."""
        safe_subject = safe_email_text(subject)
        log_id = MailLogService.record_queued(
            event_type=event,
            recipients=recipients,
            related_object_type="custom_project",
            related_object_id=str(project_id),
            subject=safe_subject,
        )
        try:
            send_text_mail(
                subject=safe_subject,
                body=body,
                recipients=recipients,
            )
        except Exception as exc:
            MailLogService.mark_failed(log_id, str(exc))
            raise
        MailLogService.mark_sent(log_id)
        logger.info(
            "custom_project_email_sent event=%s project_id=%s recipient_count=%s",
            event,
            project_id,
            len(recipients),
        )

    @classmethod
    def _enqueue(cls, event: str, project_id: UUID, message_id: UUID | None = None) -> None:
        from custom_projects.tasks import send_project_notification_task

        enqueue_after_commit(
            send_project_notification_task,
            event,
            str(project_id),
            str(message_id) if message_id else None,
        )


def deliver_project_notification(
    *,
    event: str,
    project_id: UUID,
    message_id: UUID | None = None,
) -> None:
    """Build and send a project notification email. Raises on SMTP failure."""
    try:
        project = CustomProject.objects.select_related(
            "customer",
            "assigned_designer",
            "assigned_designer__role",
        ).get(pk=project_id)
    except CustomProject.DoesNotExist:
        logger.warning(
            "custom_project_email_skipped reason=project_missing event=%s project_id=%s",
            event,
            project_id,
        )
        MailLogService.record_skipped(
            event_type=event,
            reason="project_missing",
            related_object_type="custom_project",
            related_object_id=str(project_id),
        )
        return

    if event == "project_created":
        ProjectCreationNotificationService.deliver_new_project(project)
    elif event == "quotation_sent":
        ProjectWorkflowNotificationService.deliver_quotation_sent(project)
    elif event == "quotation_accepted":
        ProjectWorkflowNotificationService.deliver_quotation_accepted(project)
    elif event == "project_delivered":
        ProjectWorkflowNotificationService.deliver_project_delivered(project)
    elif event == "project_completed":
        ProjectWorkflowNotificationService.deliver_project_completed(project)
    elif event == "message_created":
        if message_id is None:
            logger.warning(
                "custom_project_email_skipped reason=missing_message_id "
                "event=message_created project_id=%s",
                project_id,
            )
            MailLogService.record_skipped(
                event_type="message_created",
                reason="missing_message_id",
                related_object_type="custom_project",
                related_object_id=str(project_id),
            )
            return
        try:
            message = ProjectMessage.objects.get(pk=message_id, project_id=project_id)
        except ProjectMessage.DoesNotExist:
            logger.warning(
                "custom_project_email_skipped reason=message_missing "
                "event=message_created project_id=%s message_id=%s",
                project_id,
                message_id,
            )
            MailLogService.record_skipped(
                event_type="message_created",
                reason="message_missing",
                related_object_type="custom_project",
                related_object_id=str(project_id),
            )
            return
        ProjectMessageNotificationService.deliver_new_message(message, project)
    else:
        logger.warning(
            "custom_project_email_skipped reason=unknown_event event=%s project_id=%s",
            event,
            project_id,
        )
        MailLogService.record_skipped(
            event_type=event,
            reason="unknown_event",
            related_object_type="custom_project",
            related_object_id=str(project_id),
        )


class ProjectCreationNotificationService(_ProjectEmailSupport):
    """Notify staff when a customer submits a new custom project request."""

    @classmethod
    def notify_new_project(cls, project: CustomProject) -> None:
        cls._enqueue("project_created", project.pk)

    @classmethod
    def deliver_new_project(cls, project: CustomProject) -> None:
        recipients = cls._staff_recipients(project)
        if not recipients:
            cls._skip(
                event="project_created",
                reason="no_staff_recipients",
                project_id=project.pk,
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


class ProjectWorkflowNotificationService(_ProjectEmailSupport):
    """Notify parties for quotation and delivery workflow events."""

    @classmethod
    def notify_quotation_sent(cls, project: CustomProject) -> None:
        cls._enqueue("quotation_sent", project.pk)

    @classmethod
    def deliver_quotation_sent(cls, project: CustomProject) -> None:
        recipients = cls._customer_recipients(project)
        if not recipients:
            cls._skip(
                event="quotation_sent",
                reason="no_customer_recipient",
                project_id=project.pk,
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

    @classmethod
    def notify_quotation_accepted(cls, project: CustomProject) -> None:
        cls._enqueue("quotation_accepted", project.pk)

    @classmethod
    def deliver_quotation_accepted(cls, project: CustomProject) -> None:
        recipients = cls._staff_recipients(project)
        if not recipients:
            cls._skip(
                event="quotation_accepted",
                reason="no_staff_recipients",
                project_id=project.pk,
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

    @classmethod
    def notify_project_delivered(cls, project: CustomProject) -> None:
        cls._enqueue("project_delivered", project.pk)

    @classmethod
    def deliver_project_delivered(cls, project: CustomProject) -> None:
        recipients = cls._customer_recipients(project)
        if not recipients:
            cls._skip(
                event="project_delivered",
                reason="no_customer_recipient",
                project_id=project.pk,
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

    @classmethod
    def notify_project_completed(cls, project: CustomProject) -> None:
        cls._enqueue("project_completed", project.pk)

    @classmethod
    def deliver_project_completed(cls, project: CustomProject) -> None:
        recipients = cls._customer_recipients(project)
        if not recipients:
            cls._skip(
                event="project_completed",
                reason="no_customer_recipient",
                project_id=project.pk,
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


class ProjectMessageNotificationService(_ProjectEmailSupport):
    """Notify the opposite party when a project message is created."""

    @classmethod
    def notify_new_message(cls, message: ProjectMessage) -> None:
        """Enqueue a notification email for a persisted message. Never raises."""
        cls._enqueue("message_created", message.project_id, message.pk)

    @classmethod
    def deliver_new_message(
        cls,
        message: ProjectMessage,
        project: CustomProject,
    ) -> None:
        if message.sender_id == project.customer_id:
            cls._deliver_staff_of_customer_message(project, message.pk)
        else:
            cls._deliver_customer_of_staff_message(project, message.pk)

    @classmethod
    def _deliver_staff_of_customer_message(
        cls,
        project: CustomProject,
        message_id: UUID,
    ) -> None:
        recipients = cls._staff_recipients(project)
        if not recipients:
            cls._skip(
                event="message_created_customer_to_staff",
                reason="no_staff_recipients",
                project_id=project.pk,
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
    def _deliver_customer_of_staff_message(
        cls,
        project: CustomProject,
        message_id: UUID,
    ) -> None:
        recipients = cls._customer_recipients(project)
        if not recipients:
            cls._skip(
                event="message_created_staff_to_customer",
                reason="no_customer_recipient",
                project_id=project.pk,
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
