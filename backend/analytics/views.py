from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from analytics.serializers import AdminDashboardStatsSerializer
from analytics.services import DashboardStatsService


class AdminDashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request) -> Response:
        stats = DashboardStatsService.get_admin_stats()
        serializer = AdminDashboardStatsSerializer.from_service(stats)
        return Response(serializer.data)
