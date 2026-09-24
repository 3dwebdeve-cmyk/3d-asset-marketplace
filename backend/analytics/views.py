from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from analytics.serializers import (
    AdminAnalyticsSerializer,
    AdminDashboardStatsSerializer,
)
from analytics.services import AnalyticsError, AnalyticsService, DashboardStatsService


class AdminDashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request) -> Response:
        stats = DashboardStatsService.get_admin_stats()
        serializer = AdminDashboardStatsSerializer.from_service(stats)
        return Response(serializer.data)


class AdminAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request) -> Response:
        try:
            payload = AnalyticsService.get_order_analytics(
                start_date=request.query_params.get("start_date") or None,
                end_date=request.query_params.get("end_date") or None,
            )
        except AnalyticsError as exc:
            if exc.field:
                raise ValidationError({exc.field: [exc.message]}) from exc
            raise ValidationError({"detail": [exc.message]}) from exc

        serializer = AdminAnalyticsSerializer.from_service(payload)
        return Response(serializer.data)
