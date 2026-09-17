"""Helpers for enqueueing Celery work after the current DB transaction commits."""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import transaction

logger = logging.getLogger("config.celery")


def enqueue_after_commit(task: Any, *args: Any, **kwargs: Any) -> None:
    """Schedule ``task.delay(*args, **kwargs)`` after DB commit.

    Failures to reach the broker are logged and never raised to the caller so
    request handlers (including Stripe webhooks) stay non-blocking.

    When ``CELERY_TASK_ALWAYS_EAGER`` is True (tests / local without Redis), the
    task runs immediately. Django ``TestCase`` never commits its wrap transaction,
    so ``on_commit`` would otherwise never fire; eager same-process delivery can
    also see the caller's uncommitted rows.
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

    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        _enqueue()
    else:
        transaction.on_commit(_enqueue)
