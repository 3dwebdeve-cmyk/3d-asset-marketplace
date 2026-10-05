"""Helpers for enqueueing Celery work after the current DB transaction commits."""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

logger = logging.getLogger("config.celery")


def enqueue_after_commit(task: Any, *args: Any, **kwargs: Any) -> None:
    """Persist work in the caller's transaction; workers see only committed rows.

    Tests alone use eager delivery because TestCase transactions never commit.
    Production queue failures propagate instead of claiming work was accepted.
    """

    task_name = getattr(task, "name", getattr(task, "__name__", "unknown"))

    def _enqueue() -> None:
        try:
            task.delay(*args, **kwargs)
        except Exception:
            logger.exception(
                "celery_enqueue_failed task=%s",
                task_name,
            )

    if getattr(settings, "BACKGROUND_JOBS_TEST_EAGER", False):
        _enqueue()
    else:
        from mail_log.models import BackgroundJob

        BackgroundJob.objects.create(
            task_name=task_name, args=list(args), kwargs=kwargs,
        )
