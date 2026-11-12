"""Contact form email delivery.

Policy: email delivery failures never block a successful API response.
Emails are enqueued on Celery. Failures are logged. Sender name/email are
included so staff can reply.
"""

from __future__ import annotations

import logging
import base64
import re
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZipFile, ZIP_DEFLATED
from dataclasses import dataclass, field
from django.template.loader import render_to_string

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


def project_detail_rows(message: str) -> list[dict[str, str]]:
    """Keep multiline values and URLs intact while separating known brief fields."""
    labels = (
        "Services", "Project", "Specifications", "Links", "Budget", "Delivery",
        "Company", "Phone", "Purposes", "Output formats", "Delivery date",
        "NDA requested", "30% payment acknowledged", "Attached reference files",
    )
    canonical = {label.lower(): label for label in labels}
    pattern = r"^(" + "|".join(re.escape(label) for label in labels) + r"): *"
    matches = list(re.finditer(pattern, message, flags=re.MULTILINE | re.IGNORECASE))
    if not matches:
        return [{"label": "Message", "value": message.strip()}]
    rows = []
    if message[:matches[0].start()].strip():
        rows.append({"label": "Message", "value": message[:matches[0].start()].strip()})
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(message)
        rows.append({"label": canonical[match.group(1).lower()], "value": message[match.end():end].strip() or "Not specified"})
    return rows


def reference_zip(attachments: list[dict[str, str]]) -> list[tuple[str, bytes, str]]:
    """Package references in memory, retaining every file with safe unique names."""
    if not attachments:
        return []
    buffer = BytesIO()
    used_names: set[str] = set()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for index, item in enumerate(attachments, start=1):
            name = PurePosixPath(item["name"].replace("\\", "/")).name
            if name in {"", ".", ".."}:
                name = f"reference-{index}"
            path = PurePosixPath(name)
            unique_name = name
            suffix = 2
            while unique_name.casefold() in used_names:
                unique_name = f"{path.stem} ({suffix}){path.suffix}"
                suffix += 1
            used_names.add(unique_name.casefold())
            archive.writestr(unique_name, base64.b64decode(item["content"], validate=True))
    return [("project-reference-files.zip", buffer.getvalue(), "application/zip")]


@dataclass(frozen=True)
class ContactSubmissionData:
    name: str
    email: str
    subject: str
    message: str
    attachments: list[dict[str, str]] = field(default_factory=list)


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
            data.attachments,
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
                "attachments": data.attachments,
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
                html_body=render_to_string("contact/emails/submission.html", {
                    "sender_name": safe_name, "sender_email": safe_email,
                    "subject": safe_subject, "message": data.message.strip(),
                    "detail_rows": project_detail_rows(data.message),
                    "attachments": data.attachments,
                }),
                reply_to=[safe_email],
                attachments=reference_zip(data.attachments),
            )
        except Exception as exc:
            MailLogService.mark_failed(log_id, str(exc))
            raise
        MailLogService.mark_sent(log_id)
        logger.info(
            "contact_form_email_sent recipient_count=%s",
            len(recipients),
        )
