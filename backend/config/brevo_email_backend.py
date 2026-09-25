"""Django email backend that sends via Brevo HTTP API (HTTPS :443).

Use this on hosts that block outbound SMTP (e.g. Render free web services).
Set BREVO_API_KEY and EMAIL_BACKEND=config.brevo_email_backend.BrevoAPIEmailBackend
(or leave EMAIL_BACKEND unset when BREVO_API_KEY is set — settings auto-selects).
"""

from __future__ import annotations

import base64
import json
import logging
import re
from email.utils import parseaddr
from typing import Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

BREVO_SMTP_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"
_FROM_RE = re.compile(r"^(.+?)\s*<([^>]+)>$")


class BrevoAPIError(Exception):
    """Raised when Brevo rejects or cannot accept a send request."""


def _split_from_email(raw: str) -> tuple[str, str]:
    """Return (name, email) from Django-style From headers."""
    value = (raw or "").strip()
    if not value:
        return "", ""
    match = _FROM_RE.match(value)
    if match:
        return match.group(1).strip().strip('"'), match.group(2).strip()
    name, email = parseaddr(value)
    if email:
        return (name or "").strip(), email.strip()
    if "@" in value:
        return "", value
    return "", ""


def _api_address(raw: str) -> dict[str, str]:
    name, email = parseaddr(raw or "")
    result = {"email": email.strip()}
    if name.strip():
        result["name"] = name.strip()
    return result


def _attachments(message) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for attachment in message.attachments:
        if hasattr(attachment, "get_payload"):
            content = attachment.get_payload(decode=True) or b""
            filename = attachment.get_filename() or "attachment"
        else:
            filename, content, _mimetype = attachment
            if isinstance(content, str):
                content = content.encode("utf-8")
        result.append(
            {
                "name": str(filename),
                "content": base64.b64encode(bytes(content)).decode("ascii"),
            }
        )
    return result


class BrevoAPIEmailBackend(BaseEmailBackend):
    """Send messages through Brevo's transactional email REST API."""

    def send_messages(self, email_messages: Sequence) -> int:
        if not email_messages:
            return 0

        api_key = (getattr(settings, "BREVO_API_KEY", "") or "").strip()
        if not api_key:
            if self.fail_silently:
                return 0
            raise BrevoAPIError(
                "BREVO_API_KEY is empty. Create an API key in Brevo "
                "(SMTP & API → API keys) and set it on the host."
            )

        sent_count = 0
        for message in email_messages:
            try:
                self._send_one(message, api_key=api_key)
            except Exception as exc:
                if not self.fail_silently:
                    raise
                logger.exception("brevo_send_failed silently: %s", exc)
            else:
                sent_count += 1
        return sent_count

    def _send_one(self, message, *, api_key: str) -> None:
        from_raw = message.from_email or settings.DEFAULT_FROM_EMAIL
        sender_name, sender_email = _split_from_email(from_raw)
        if not sender_email:
            raise BrevoAPIError(
                f"Invalid DEFAULT_FROM_EMAIL / from_email: {from_raw!r}"
            )

        recipients = list(message.to or [])
        if not recipients:
            raise BrevoAPIError("Message has no recipients.")

        payload: dict = {
            "sender": {"email": sender_email},
            "to": [_api_address(addr) for addr in recipients],
            "subject": message.subject or "(no subject)",
        }
        if sender_name:
            payload["sender"]["name"] = sender_name
        else:
            configured_name = (
                getattr(settings, "BREVO_SENDER_NAME", "") or ""
            ).strip()
            if configured_name:
                payload["sender"]["name"] = configured_name

        body = message.body or ""
        if message.content_subtype == "html":
            payload["htmlContent"] = body
        else:
            payload["textContent"] = body

        # Prefer plain text when alternatives exist (Django EmailMultiAlternatives).
        alternatives = getattr(message, "alternatives", None) or []
        for content, mimetype in alternatives:
            if mimetype == "text/html":
                payload["htmlContent"] = content
            elif mimetype == "text/plain" and "textContent" not in payload:
                payload["textContent"] = content

        if "textContent" not in payload and "htmlContent" not in payload:
            payload["textContent"] = body or " "

        if message.cc:
            payload["cc"] = [_api_address(addr) for addr in message.cc]
        if message.bcc:
            payload["bcc"] = [_api_address(addr) for addr in message.bcc]
        if message.reply_to:
            payload["replyTo"] = _api_address(message.reply_to[0])
        attachments = _attachments(message)
        if attachments:
            payload["attachment"] = attachments

        data = json.dumps(payload).encode("utf-8")
        request = Request(
            getattr(settings, "BREVO_API_URL", BREVO_SMTP_EMAIL_URL),
            data=data,
            method="POST",
            headers={
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json",
            },
        )
        try:
            timeout = int(getattr(settings, "BREVO_API_TIMEOUT_SECONDS", 15))
            with urlopen(request, timeout=timeout) as response:
                status = getattr(response, "status", 200)
                raw = response.read()
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise BrevoAPIError(
                f"Brevo API HTTP {exc.code}: {detail}"
            ) from exc
        except URLError as exc:
            raise BrevoAPIError(f"Brevo API connection failed: {exc}") from exc

        if status >= 400:
            raise BrevoAPIError(
                f"Brevo API HTTP {status}: {raw.decode('utf-8', errors='replace')[:500]}"
            )
        # Never place recipient addresses in application logs.
        logger.info("brevo_email_sent recipient_count=%s", len(recipients))
