"""Contact form email delivery.

Policy: email delivery failures never block a successful API response.
Emails are enqueued on Celery. Failures are logged. Sender name/email are
included so staff can reply.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from accounts.models import User
from accounts.services import AuthenticationService
from config.celery_utils import enqueue_after_commit

logger = logging.getLogger("contact.notifications")


@dataclass(frozen=True)
class ContactSubmissionData:
    name: str
    email: str
    subject: str
    message: str


class ContactService:
    SUCCESS_DETAIL = "Message sent — we'll reply by email."

    @staticmethod
    def _safe_email_text(value: str) -> str:
        """Collapse whitespace/newlines so values cannot inject email headers."""
        return " ".join(str(value).replace("\r", " ").replace("\n", " ").split())

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
            return cls.SUCCESS_DETAIL

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
            return

        safe_name = cls._safe_email_text(data.name)
        safe_subject = cls._safe_email_text(data.subject)
        safe_email = cls._safe_email_text(data.email)
        body = render_to_string(
            "contact/emails/submission.txt",
            {
                "sender_name": safe_name,
                "sender_email": safe_email,
                "subject": safe_subject,
                "message": data.message.strip(),
            },
        ).strip() + "\n"

        send_mail(
            subject=f"Contact form: {safe_subject}",
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=False,
        )
        logger.info(
            "contact_form_email_sent recipient_count=%s",
            len(recipients),
        )
