"""Security emails: new-device sign-ins, administrator sign-ins, two-factor changes.

A browser is identified by a random httpOnly cookie; only its SHA-256 is stored. An
account's first recorded device is saved silently, so existing users are not emailed
on their first sign-in after this feature ships.
"""

from __future__ import annotations

import hashlib
import secrets

from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from accounts.auth_cookies import refresh_cookie_samesite, refresh_cookie_secure
from accounts.models import KnownDevice, User
from config.mail import frontend_base_url, safe_email_text, send_text_mail
from mail_log.services import MailLogService

DEVICE_COOKIE_NAME = "device_id"
DEVICE_COOKIE_PATH = "/api/v1/auth/"
DEVICE_COOKIE_MAX_AGE = 400 * 24 * 3600  # Browsers cap cookies at 400 days.


def _device_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _user_agent(request: HttpRequest) -> str:
    return safe_email_text(request.META.get("HTTP_USER_AGENT", ""))[:255]


def _device_cookie_value(request: HttpRequest) -> str:
    """The browser's device id, minted once per request when it has none yet."""
    raw = getattr(request, "_device_cookie_value", None)
    if raw is None:
        raw = str(request.COOKIES.get(DEVICE_COOKIE_NAME, "") or "")
        if len(raw) < 32:
            raw = secrets.token_urlsafe(32)
        request._device_cookie_value = raw
    return raw


def device_hash_for_request(request: HttpRequest) -> str:
    return _device_hash(_device_cookie_value(request))


def register_sign_in(request: HttpRequest, response: HttpResponse, user: User) -> None:
    """Record the browser and email the owner when it is new to an account with history."""
    raw = _device_cookie_value(request)
    device_hash = _device_hash(raw)
    user_agent = _user_agent(request)

    device = KnownDevice.objects.filter(user=user, device_hash=device_hash).first()
    if device is None:
        has_history = KnownDevice.objects.filter(user=user).exists()
        KnownDevice.objects.create(user=user, device_hash=device_hash, user_agent=user_agent)
        if has_history:
            from accounts.tasks import send_new_device_sign_in_task
            from config.celery_utils import enqueue_after_commit

            enqueue_after_commit(send_new_device_sign_in_task, str(user.pk), user_agent)
    else:
        device.save(update_fields=["last_seen_at"])

    response.set_cookie(
        DEVICE_COOKIE_NAME,
        raw,
        max_age=DEVICE_COOKIE_MAX_AGE,
        path=DEVICE_COOKIE_PATH,
        httponly=True,
        secure=refresh_cookie_secure(),
        samesite=refresh_cookie_samesite(),
    )


def notify_admin_sign_in(request: HttpRequest, user: User, *, method: str) -> None:
    from accounts.tasks import send_admin_sign_in_alert_task
    from config.celery_utils import enqueue_after_commit

    enqueue_after_commit(send_admin_sign_in_alert_task, str(user.pk), _user_agent(request), method)


def notify_mfa_enabled(user: User) -> None:
    from accounts.tasks import send_mfa_enabled_task
    from config.celery_utils import enqueue_after_commit

    enqueue_after_commit(send_mfa_enabled_task, str(user.pk))


def _deliver(user: User, *, event_type: str, subject: str, body: str) -> None:
    if not user.is_active or not (user.email or "").strip():
        MailLogService.record_skipped(
            event_type=event_type,
            reason="inactive_or_no_email",
            related_object_type="user",
            related_object_id=str(user.pk),
        )
        return
    log_id = MailLogService.record_queued(
        event_type=event_type,
        recipients=[user.email],
        related_object_type="user",
        related_object_id=str(user.pk),
        subject=subject,
    )
    try:
        send_text_mail(subject=subject, body=body, recipients=[user.email])
    except Exception as exc:
        MailLogService.mark_failed(log_id, str(exc))
        raise
    MailLogService.mark_sent(log_id)


def _when() -> str:
    return timezone.now().strftime("%Y-%m-%d %H:%M UTC")


def deliver_new_device_sign_in(user: User, user_agent: str) -> None:
    reset_link = f"{frontend_base_url()}/forgot-password"
    _deliver(
        user,
        event_type="new_device_sign_in",
        subject="New sign-in to your 3D Asset Marketplace account",
        body=(
            "Your account was just signed in to from a browser we have not seen before.\n\n"
            f"When: {_when()}\n"
            f"Browser: {safe_email_text(user_agent) or 'unknown'}\n\n"
            "If this was you, no action is needed.\n"
            "If it was not, reset your password now:\n"
            f"{reset_link}\n"
        ),
    )


def deliver_admin_sign_in_alert(user: User, user_agent: str, method: str) -> None:
    from accounts.mfa import remaining_recovery_codes

    lines = [
        "An administrator sign-in to the 3D Asset Marketplace console just completed.\n",
        f"Account: {user.email}",
        f"When: {_when()}",
        f"Browser: {safe_email_text(user_agent) or 'unknown'}",
    ]
    if method == "recovery_code":
        lines.append(
            f"Second factor: a recovery code ({remaining_recovery_codes(user)} left). "
            "Create new codes from the console if you are running low."
        )
    lines.append(
        "\nIf this was not you, contact the other administrators immediately so they can "
        "reset your password and two-factor sign-in."
    )
    _deliver(
        user,
        event_type="admin_sign_in",
        subject="Administrator sign-in to 3D Asset Marketplace",
        body="\n".join(lines) + "\n",
    )


def deliver_mfa_enabled(user: User) -> None:
    _deliver(
        user,
        event_type="admin_mfa_enabled",
        subject="Two-factor sign-in was set up on your administrator account",
        body=(
            "Two-factor sign-in was just set up on your 3D Asset Marketplace "
            "administrator account.\n\n"
            f"When: {_when()}\n\n"
            "If you did not do this, someone has your password. Contact the other "
            "administrators immediately so they can reset your account.\n"
        ),
    )
