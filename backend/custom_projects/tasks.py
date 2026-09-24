"""Celery tasks for custom project email notifications."""

from __future__ import annotations

import logging
from uuid import UUID

from celery import shared_task

logger = logging.getLogger("custom_projects.tasks")

_VALID_EVENTS = frozenset(
    {
        "project_created",
        "quotation_sent",
        "quotation_accepted",
        "project_delivered",
        "project_completed",
        "message_created",
    }
)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    queue="email",
    name="custom_projects.send_notification",
)
def send_project_notification_task(
    self,
    event: str,
    project_id: str,
    message_id: str | None = None,
) -> None:
    """Deliver a custom-project workflow email. Retries on SMTP failure."""
    if event not in _VALID_EVENTS:
        logger.warning(
            "project_email_task_skipped reason=unknown_event event=%s project_id=%s",
            event,
            project_id,
        )
        return

    from custom_projects.notifications import deliver_project_notification

    deliver_project_notification(
        event=event,
        project_id=UUID(project_id),
        message_id=UUID(message_id) if message_id else None,
    )
