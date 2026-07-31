from django.urls import path

from payments.views import AdminPaymentDetailView, AdminPaymentListView

app_name = "payments_admin"

urlpatterns = [
    path("", AdminPaymentListView.as_view(), name="admin-payment-list"),
    path(
        "<uuid:payment_id>/",
        AdminPaymentDetailView.as_view(),
        name="admin-payment-detail",
    ),
]
