from django.urls import path

from reviews.views import MyReviewView, ReviewEligibilityView, ReviewListCreateView

app_name = "reviews"

urlpatterns = [
    path("", ReviewListCreateView.as_view(), name="review-list-create"),
    path("mine/", MyReviewView.as_view(), name="review-mine"),
    path("eligibility/", ReviewEligibilityView.as_view(), name="review-eligibility"),
]
