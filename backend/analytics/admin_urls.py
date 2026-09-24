from django.urls import path

from analytics.views import AdminDashboardStatsView

app_name = "analytics_admin"

urlpatterns = [
    path("stats/", AdminDashboardStatsView.as_view(), name="admin-dashboard-stats"),
]
