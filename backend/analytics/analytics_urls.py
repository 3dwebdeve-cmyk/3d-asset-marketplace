from django.urls import path

from analytics.views import AdminAnalyticsView

app_name = "analytics"

urlpatterns = [
    path("", AdminAnalyticsView.as_view(), name="admin-analytics"),
]
