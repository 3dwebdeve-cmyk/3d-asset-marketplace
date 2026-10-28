from django.urls import path

from reviews.views import (
    MyReviewView,
    ReviewEligibilityView,
    ReviewListCreateView,
    ReviewReactionView,
    ReviewReplyCreateView,
    ReviewReplyReactionView,
)

app_name = "reviews"

urlpatterns = [
    path("", ReviewListCreateView.as_view(), name="review-list-create"),
    path("mine/", MyReviewView.as_view(), name="review-mine"),
    path("eligibility/", ReviewEligibilityView.as_view(), name="review-eligibility"),
    path("<uuid:review_id>/replies/", ReviewReplyCreateView.as_view(), name="review-reply-create"),
    path("<uuid:review_id>/reaction/", ReviewReactionView.as_view(), name="review-reaction"),
    path("replies/<uuid:reply_id>/reaction/", ReviewReplyReactionView.as_view(), name="review-reply-reaction"),
]
