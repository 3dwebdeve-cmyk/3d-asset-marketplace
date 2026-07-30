from django.urls import path

from reviews.views import AdminReviewDetailView, AdminReviewListView

app_name = "reviews_admin"

urlpatterns = [
    path("", AdminReviewListView.as_view(), name="admin-review-list"),
    path(
        "<uuid:review_id>/",
        AdminReviewDetailView.as_view(),
        name="admin-review-detail",
    ),
]
