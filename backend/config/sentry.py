"""Sentry initialization and PII / secret scrubbing for the Django API."""

from __future__ import annotations

import re
from urllib.parse import unquote_plus
from typing import Any

import sentry_sdk
from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber

# Keys that must never leave the process in event payloads.
_EXTRA_DENYLIST = [
    *DEFAULT_DENYLIST,
    "access",
    "access_token",
    "authorization",
    "client_secret",
    "csrfmiddlewaretoken",
    "email",
    "password",
    "refresh",
    "refresh_token",
    "secret",
    "secret_key",
    "sessionid",
    "stripe_secret_key",
    "stripe_webhook_secret",
    "token",
]

_SENSITIVE_HEADER_NAMES = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-csrftoken",
        "x-forwarded-authorization",
    }
)

_SENSITIVE_QUERY_KEYS = frozenset(
    {
        "access_token",
        "api_key",
        "email",
        "password",
        "refresh",
        "refresh_token",
        "secret",
        "token",
    }
)

_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
)
_BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9\-._~+/]+=*")
_JWT_RE = re.compile(
    r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b",
)


def _scrub_string(value: str) -> str:
    value = re.sub(
        r"/(reset-password|verify-email)/[^/?#]+/[^/?#]+",
        r"/\1/[Filtered]/[Filtered]", value, flags=re.I,
    )
    value = re.sub(
        r"([?&](?:token|access_token|refresh_token|password|secret|email|x-amz-[^=&#]+)=)[^&#\s]*",
        r"\1[Filtered]", value, flags=re.I,
    )
    scrubbed = _BEARER_RE.sub("Bearer [Filtered]", value)
    scrubbed = _JWT_RE.sub("[Filtered]", scrubbed)
    return _EMAIL_RE.sub("[filtered-email]", scrubbed)


def _scrub_headers(headers: dict[str, Any] | None) -> None:
    if not isinstance(headers, dict):
        return
    for key in list(headers):
        if str(key).lower() in _SENSITIVE_HEADER_NAMES:
            headers[key] = "[Filtered]"


def _scrub_query_string(query: str) -> str:
    if not query:
        return query
    parts: list[str] = []
    for piece in query.split("&"):
        if "=" not in piece:
            parts.append(piece)
            continue
        key, _, value = piece.partition("=")
        normalized = unquote_plus(key).lower()
        if normalized in _SENSITIVE_QUERY_KEYS or normalized.startswith("x-amz-"):
            parts.append(f"{key}=[Filtered]")
        else:
            parts.append(f"{key}={_scrub_string(value)}")
    return "&".join(parts)


def _scrub_request(event: dict[str, Any]) -> None:
    request = event.get("request")
    if not isinstance(request, dict):
        return

    _scrub_headers(request.get("headers"))
    if "cookies" in request:
        request["cookies"] = "[Filtered]"
    if "data" in request:
        request["data"] = "[Filtered]"
    if isinstance(request.get("query_string"), str):
        request["query_string"] = _scrub_query_string(request["query_string"])
    if isinstance(request.get("url"), str):
        url = request["url"]
        if "?" in url:
            base, _, query = url.partition("?")
            request["url"] = f"{base}?{_scrub_query_string(query)}"


def _scrub_user(event: dict[str, Any]) -> None:
    user = event.get("user")
    if not isinstance(user, dict):
        return
    for key in ("email", "username", "ip_address"):
        if key in user:
            user[key] = "[Filtered]"
    # Keep opaque ids for debugging ownership without PII.
    if "id" in user and user["id"] is not None:
        user["id"] = str(user["id"])


def _scrub_frames(event: dict[str, Any]) -> None:
    exception = event.get("exception")
    if not isinstance(exception, dict):
        return
    values = exception.get("values")
    if not isinstance(values, list):
        return
    for item in values:
        if not isinstance(item, dict):
            continue
        if isinstance(item.get("value"), str):
            item["value"] = _scrub_string(item["value"])
        stacktrace = item.get("stacktrace")
        if not isinstance(stacktrace, dict):
            continue
        frames = stacktrace.get("frames")
        if not isinstance(frames, list):
            continue
        for frame in frames:
            if not isinstance(frame, dict):
                continue
            vars_map = frame.get("vars")
            if not isinstance(vars_map, dict):
                continue
            for key in list(vars_map):
                lowered = str(key).lower()
                if any(
                    token in lowered
                    for token in (
                        "password",
                        "token",
                        "secret",
                        "authorization",
                        "cookie",
                        "email",
                        "api_key",
                    )
                ):
                    vars_map[key] = "[Filtered]"
                elif isinstance(vars_map[key], str):
                    vars_map[key] = _scrub_string(vars_map[key])


def before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Drop nothing by default; scrub tokens, passwords, and PII from payloads."""
    del hint  # unused; kept for Sentry callback signature
    _scrub_request(event)
    _scrub_user(event)
    _scrub_frames(event)

    message = event.get("message")
    if isinstance(message, str):
        event["message"] = _scrub_string(message)

    return _scrub_recursive(event)


def _scrub_recursive(value):
    if isinstance(value, str):
        return _scrub_string(value)
    if isinstance(value, list):
        return [_scrub_recursive(item) for item in value]
    if isinstance(value, dict):
        return {
            key: "[Filtered]" if re.search(
                r"password|token|secret|authorization|cookie|email|api[_-]?key", str(key), re.I,
            ) else _scrub_recursive(item)
            for key, item in value.items()
        }
    return value


def init_sentry(
    *,
    dsn: str,
    environment: str,
    release: str | None,
    traces_sample_rate: float,
) -> None:
    """Initialize Sentry when a DSN is configured. No-op callers should skip this."""
    # Django, Celery, and Logging integrations auto-enable when those packages
    # are installed; ERROR+ log records become Sentry events by default.
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release or None,
        send_default_pii=False,
        traces_sample_rate=traces_sample_rate,
        max_request_body_size="never",
        before_send=before_send,
        before_send_transaction=before_send,
        event_scrubber=EventScrubber(denylist=_EXTRA_DENYLIST, recursive=True),
    )


def capture_webhook_failure(
    message: str,
    *,
    reason: str,
    level: str = "error",
    event_type: str | None = None,
    exc: BaseException | None = None,
) -> None:
    """Report Stripe webhook operational failures with a stable alert tag."""
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("area", "payments_webhook")
        scope.set_tag("webhook.reason", reason)
        if event_type:
            scope.set_tag("stripe.event_type", event_type)
        scope.fingerprint = ["payments-webhook", reason]
        if exc is not None:
            sentry_sdk.capture_exception(exc)
        else:
            sentry_sdk.capture_message(message, level=level)


def capture_download_spike(*, user_id: str, links_last_hour: int) -> None:
    """Alert when one account requests unusually many download links (scraping signal)."""
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("area", "downloads")
        scope.set_tag("downloads.alert", "hourly_spike")
        # Pseudonymous account ID only; the email stays out of Sentry.
        scope.set_extra("user_id", user_id)
        scope.set_extra("links_last_hour", links_last_hour)
        scope.fingerprint = ["downloads-hourly-spike", user_id]
        sentry_sdk.capture_message("Download link spike for one account", level="warning")
