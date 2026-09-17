"""Celery tasks for account email delivery (verification + password emails).

Tasks receive only user IDs — tokens are rebuilt in the worker so they never
travel through the Redis broker payload.
"""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger("accounts.tasks")


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    name="accounts.send_email_verification",
)
def send_email_verification_task(self, user_id: str) -> None:
    from accounts.models import User
    from accounts.services import EmailVerificationService

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning(
            "email_verification_task_skipped reason=user_missing user_id=%s",
            user_id,
        )
        return

    EmailVerificationService.deliver_verification(user)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    name="accounts.send_password_reset",
)
def send_password_reset_task(self, user_id: str) -> None:
    from accounts.models import User
    from accounts.services import PasswordResetService

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning(
            "password_reset_task_skipped reason=user_missing user_id=%s",
            user_id,
        )
        return

    PasswordResetService.deliver_reset(user)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    name="accounts.send_password_changed",
)
def send_password_changed_task(self, user_id: str) -> None:
    from accounts.models import User
    from accounts.services import AuthenticationService

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning(
            "password_changed_task_skipped reason=user_missing user_id=%s",
            user_id,
        )
        return

    AuthenticationService.deliver_password_changed(user)
