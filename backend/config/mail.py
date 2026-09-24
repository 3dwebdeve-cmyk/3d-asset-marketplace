"""Shared outbound email helpers.

Consolidate safe-text / base-URL / render / send so domain notification modules
do not duplicate header-injection guards or FRONTEND_BASE_URL lookups.
"""

from __future__ import annotations

from typing import Sequence

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string


def frontend_base_url() -> str:
    return getattr(
        settings,
        "FRONTEND_BASE_URL",
        "http://localhost:5173",
    ).rstrip("/")


def frontend_base_url_is_localhost(url: str | None = None) -> bool:
    """True when the SPA base URL host is localhost / loopback."""
    from urllib.parse import urlparse

    value = frontend_base_url() if url is None else str(url).rstrip("/")
    host = (urlparse(value).hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def frontend_base_url_uses_https(url: str | None = None) -> bool:
    """True when the SPA base URL uses the https scheme."""
    from urllib.parse import urlparse

    value = frontend_base_url() if url is None else str(url).rstrip("/")
    return (urlparse(value).scheme or "").lower() == "https"


def safe_email_text(value: str) -> str:
    """Collapse whitespace/newlines so values cannot inject email headers."""
    return " ".join(str(value).replace("\r", " ").replace("\n", " ").split())


def render_text_email(template: str, context: dict) -> str:
    """Render a Django text email template and ensure a trailing newline."""
    return render_to_string(template, context).strip() + "\n"


def send_text_mail(
    *,
    subject: str,
    body: str,
    recipients: Sequence[str],
    from_email: str | None = None,
) -> None:
    """Send a plain-text email. Raises on SMTP failure for Celery retries."""
    send_mail(
        subject=safe_email_text(subject),
        message=body,
        from_email=from_email or settings.DEFAULT_FROM_EMAIL,
        recipient_list=list(recipients),
        fail_silently=False,
    )
