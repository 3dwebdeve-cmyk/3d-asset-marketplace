"""Query helpers for durable admin ActivityLog rows."""

from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from accounts.models import ActivityLog


class ActivityLogService:
    @classmethod
    def list_logs(
        cls,
        *,
        action: str | None = None,
        actor_id: UUID | None = None,
        target_id: str | None = None,
    ) -> QuerySet[ActivityLog]:
        queryset = ActivityLog.objects.select_related("actor").all()
        if action:
            queryset = queryset.filter(action=action.strip()[:100])
        if actor_id is not None:
            queryset = queryset.filter(actor_id=actor_id)
        if target_id:
            queryset = queryset.filter(target_id=str(target_id).strip()[:64])
        return queryset
