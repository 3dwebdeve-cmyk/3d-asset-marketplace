from django.urls import path

from downloads.views import AdminDownloadHistoryListView

app_name = "downloads_admin"

urlpatterns = [
    path(
        "history/",
        AdminDownloadHistoryListView.as_view(),
        name="admin-download-history",
    ),
]
