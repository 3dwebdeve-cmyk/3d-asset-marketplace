from django.urls import path

from payments.views import (
    ConfirmCheckoutSessionView,
    CreateCheckoutSessionView,
    StripeWebhookView,
)

app_name = "payments"

urlpatterns = [
    path("checkout/", CreateCheckoutSessionView.as_view(), name="checkout"),
    path("confirm/", ConfirmCheckoutSessionView.as_view(), name="confirm"),
    path("webhook/", StripeWebhookView.as_view(), name="webhook"),
]
