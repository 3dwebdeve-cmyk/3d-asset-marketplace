"""Celery tasks for contact form email delivery."""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger("contact.tasks")


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    name="contact.send_submission",
)
def send_contact_submission_task(
    self,
    name: str,
    email: str,
    subject: str,
    message: str,
) -> None:
    """Deliver a contact-form email to configured admins. Retries on SMTP failure."""
    from contact.services import ContactService, ContactSubmissionData

    ContactService.deliver(
        ContactSubmissionData(
            name=name,
            email=email,
            subject=subject,
            message=message,
        )
    )
