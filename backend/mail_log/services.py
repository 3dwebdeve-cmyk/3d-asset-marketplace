"""Fail-soft persistence for outbound email attempts.

Logging must never raise into workflow callers. Celery deliver functions still
re-raise SMTP errors after mark_failed so retries continue to work.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Sequence
from uuid import UUID

from django.utils import timezone

from mail_log.models import OutboundEmailLog

logger = logging.getLogger("mail_log")


def hash_recipients(recipients: Sequence[str] | None) -> str:
    """Stable hash of one or more emails (sorted, lowercased). Never cleartext."""
    parts: list[str] = []
    seen: set[str] = set()
    for raw in recipients or []:
        normalized = (raw or "").strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        parts.append(normalized)
    if not parts:
        return "-"
    digest = hashlib.sha256("|".join(sorted(parts)).encode("utf-8")).hexdigest()[:12]
    return f"sha256:{digest}"


class MailLogService:
    @classmethod
    def record_queued(
        cls,
        *,
        event_type: str,
        recipients: Sequence[str],
        related_object_type: str = "",
        related_object_id: str = "",
        subject: str = "",
    ) -> UUID | None:
        try:
            row = OutboundEmailLog.objects.create(
                event_type=event_type[:64],
                status=OutboundEmailLog.Status.QUEUED,
                recipient_hash=hash_recipients(recipients),
                related_object_type=(related_object_type or "")[:64],
                related_object_id=str(related_object_id or "")[:64],
                subject=(subject or "")[:255],
            )
            return row.pk
        except Exception:
            logger.exception(
                "mail_log_record_queued_failed event_type=%s",
                event_type,
            )
            return None

    @classmethod
    def record_skipped(
        cls,
        *,
        event_type: str,
        reason: str,
        related_object_type: str = "",
        related_object_id: str = "",
        subject: str = "",
        recipients: Sequence[str] | None = None,
    ) -> UUID | None:
        try:
            row = OutboundEmailLog.objects.create(
                event_type=event_type[:64],
                status=OutboundEmailLog.Status.SKIPPED,
                recipient_hash=hash_recipients(recipients),
                related_object_type=(related_object_type or "")[:64],
                related_object_id=str(related_object_id or "")[:64],
                subject=(subject or "")[:255],
                error=(reason or "")[:2000],
            )
            return row.pk
        except Exception:
            logger.exception(
                "mail_log_record_skipped_failed event_type=%s",
                event_type,
            )
            return None

    @classmethod
    def mark_sent(cls, log_id: UUID | None) -> None:
        if log_id is None:
            return
        try:
            OutboundEmailLog.objects.filter(pk=log_id).update(
                status=OutboundEmailLog.Status.SENT,
                error="",
                updated_at=timezone.now(),
            )
        except Exception:
            logger.exception("mail_log_mark_sent_failed log_id=%s", log_id)

    @classmethod
    def mark_failed(cls, log_id: UUID | None, error: str) -> None:
        if log_id is None:
            return
        try:
            OutboundEmailLog.objects.filter(pk=log_id).update(
                status=OutboundEmailLog.Status.FAILED,
                error=(error or "")[:2000],
                updated_at=timezone.now(),
            )
        except Exception:
            logger.exception("mail_log_mark_failed_failed log_id=%s", log_id)
