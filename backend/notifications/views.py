from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import NotificationWriteRateThrottle
from notifications.pagination import NotificationPagination
from notifications.serializers import NotificationSerializer, UnreadCountSerializer
from notifications.services import NotificationError, NotificationService


def _notification_error_response(exc: NotificationError) -> Response:
    if exc.field:
        return Response(
            {exc.field: [exc.message]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"detail": exc.message, "code": "notification_error"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _parse_optional_bool(raw: str | None, *, field: str) -> bool | None:
    if raw is None or raw == "":
        return None
    normalized = raw.strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValidationError({field: [f"Invalid {field} filter."]})


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = NotificationPagination

    def get(self, request: Request) -> Response:
        try:
            is_read = _parse_optional_bool(
                request.query_params.get("is_read"),
                field="is_read",
            )
            queryset = NotificationService.list_for_user(
                request.user,
                is_read=is_read,
                ordering=request.query_params.get("ordering") or "-created_at",
            )
        except NotificationError as exc:
            return _notification_error_response(exc)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = NotificationSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class NotificationUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        payload = {"unread_count": NotificationService.unread_count(request.user)}
        serializer = UnreadCountSerializer(payload)
        return Response(serializer.data)


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [NotificationWriteRateThrottle]

    def post(self, request: Request, notification_id: UUID) -> Response:
        try:
            notification = NotificationService.mark_read(request.user, notification_id)
        except NotificationError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [NotificationWriteRateThrottle]

    def post(self, request: Request) -> Response:
        updated = NotificationService.mark_all_read(request.user)
        return Response({"updated": updated, "unread_count": 0})
