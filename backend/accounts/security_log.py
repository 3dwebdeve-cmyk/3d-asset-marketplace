"""Security-oriented logging helpers for auth and admin actions."""

from __future__ import annotations

import logging

security_logger = logging.getLogger("accounts.security")


def log_auth_failure(*, scope: str, email: str | None = None) -> None:
    security_logger.warning(
        "auth_failure scope=%s email=%s",
        scope,
        (email or "").strip().lower() or "-",
    )


def log_admin_action(*, action: str, actor_id: str, target_id: str | None = None) -> None:
    security_logger.info(
        "admin_action action=%s actor_id=%s target_id=%s",
        action,
        actor_id,
        target_id or "-",
    )


def log_password_reset(
    *,
    action: str,
    email: str | None = None,
    user_id: str | None = None,
) -> None:
    security_logger.info(
        "password_reset action=%s email=%s user_id=%s",
        action,
        (email or "").strip().lower() or "-",
        user_id or "-",
    )


def log_email_verification(
    *,
    action: str,
    email: str | None = None,
    user_id: str | None = None,
) -> None:
    security_logger.info(
        "email_verification action=%s email=%s user_id=%s",
        action,
        (email or "").strip().lower() or "-",
        user_id or "-",
    )
