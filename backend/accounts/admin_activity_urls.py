from django.urls import path

from accounts.views import AdminActivityLogListView

app_name = "accounts_activity_admin"

urlpatterns = [
    path(
        "",
        AdminActivityLogListView.as_view(),
        name="admin-activity-logs",
    ),
]
