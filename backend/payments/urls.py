from django.urls import path

from payments.views import CreateCheckoutSessionView, StripeWebhookView

app_name = "payments"

urlpatterns = [
    path("checkout/", CreateCheckoutSessionView.as_view(), name="checkout"),
    path("webhook/", StripeWebhookView.as_view(), name="webhook"),
]
