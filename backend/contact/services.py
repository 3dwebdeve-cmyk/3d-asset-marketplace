"""Contact form email delivery.

Policy: email delivery failures never block a successful API response.
Emails are enqueued on Celery. Failures are logged. Sender name/email are
included so staff can reply.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.conf import settings
from rest_framework.exceptions import APIException


class ContactUnavailable(APIException):
    status_code = 503
    default_detail = "Contact delivery is not configured. Please try again later."

from accounts.models import User
from accounts.services import AuthenticationService
from config.celery_utils import enqueue_after_commit
from config.mail import render_text_email, safe_email_text, send_text_mail
from mail_log.services import MailLogService

logger = logging.getLogger("contact.notifications")


@dataclass(frozen=True)
class ContactSubmissionData:
    name: str
    email: str
    subject: str
    message: str


class ContactService:
    SUCCESS_DETAIL = "Your enquiry has been received for delivery."

    @staticmethod
    def _safe_email_text(value: str) -> str:
        return safe_email_text(value)

    @classmethod
    def _configured_recipients(cls) -> list[str]:
        for setting_name in ("CONTACT_ADMIN_RECIPIENTS", "PROJECT_MESSAGE_ADMIN_RECIPIENTS"):
            raw = getattr(settings, setting_name, "") or ""
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
    def submit(cls, data: ContactSubmissionData, *, honeypot_triggered: bool = False) -> str:
        if honeypot_triggered:
            logger.info("contact_form_honeypot_discarded")
            return cls.SUCCESS_DETAIL

        recipients = cls._configured_recipients()
        if not recipients:
            logger.warning("contact_form_email_skipped reason=no_admin_recipients")
            raise ContactUnavailable()

        from contact.tasks import send_contact_submission_task

        enqueue_after_commit(
            send_contact_submission_task,
            data.name,
            data.email,
            data.subject,
            data.message,
        )
        return cls.SUCCESS_DETAIL

    @classmethod
    def deliver(cls, data: ContactSubmissionData) -> None:
        """Send contact email now. Raises on SMTP failure for Celery retries."""
        recipients = cls._configured_recipients()
        if not recipients:
            logger.warning("contact_form_email_skipped reason=no_admin_recipients")
            MailLogService.record_skipped(
                event_type="contact_submission",
                reason="no_admin_recipients",
                related_object_type="contact",
            )
            return

        safe_name = cls._safe_email_text(data.name)
        safe_subject = cls._safe_email_text(data.subject)
        safe_email = cls._safe_email_text(data.email)
        body = render_text_email(
            "contact/emails/submission.txt",
            {
                "sender_name": safe_name,
                "sender_email": safe_email,
                "subject": safe_subject,
                "message": data.message.strip(),
            },
        )
        subject = f"Contact form: {safe_subject}"
        log_id = MailLogService.record_queued(
            event_type="contact_submission",
            recipients=recipients,
            related_object_type="contact",
            subject=subject,
        )
        try:
            send_text_mail(
                subject=subject,
                body=body,
                recipients=recipients,
            )
        except Exception as exc:
            MailLogService.mark_failed(log_id, str(exc))
            raise
        MailLogService.mark_sent(log_id)
        logger.info(
            "contact_form_email_sent recipient_count=%s",
            len(recipients),
        )
