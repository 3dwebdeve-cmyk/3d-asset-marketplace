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
    queue="email",
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
    queue="email",
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
    queue="email",
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


def _load_user(user_id: str, task: str):
    from accounts.models import User

    user = User.objects.filter(pk=user_id).first()
    if user is None:
        logger.warning("%s_task_skipped reason=user_missing user_id=%s", task, user_id)
    return user


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    queue="email",
    name="accounts.send_new_device_sign_in",
)
def send_new_device_sign_in_task(self, user_id: str, user_agent: str = "") -> None:
    from accounts.security_notices import deliver_new_device_sign_in

    user = _load_user(user_id, "new_device_sign_in")
    if user is not None:
        deliver_new_device_sign_in(user, user_agent)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    queue="email",
    name="accounts.send_admin_sign_in_alert",
)
def send_admin_sign_in_alert_task(
    self, user_id: str, user_agent: str = "", method: str = "totp"
) -> None:
    from accounts.security_notices import deliver_admin_sign_in_alert

    user = _load_user(user_id, "admin_sign_in_alert")
    if user is not None:
        deliver_admin_sign_in_alert(user, user_agent, method)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    queue="email",
    name="accounts.send_mfa_enabled",
)
def send_mfa_enabled_task(self, user_id: str) -> None:
    from accounts.security_notices import deliver_mfa_enabled

    user = _load_user(user_id, "mfa_enabled")
    if user is not None:
        deliver_mfa_enabled(user)
