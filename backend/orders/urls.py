from django.urls import path

from orders.views import (
    CustomerOrderDetailView,
    CustomerOrderInvoiceView,
    CustomerOrderListView,
)

app_name = "orders"

urlpatterns = [
    path("", CustomerOrderListView.as_view(), name="order-list"),
    path(
        "<uuid:order_id>/invoice/",
        CustomerOrderInvoiceView.as_view(),
        name="order-invoice",
    ),
    path(
        "<uuid:order_id>/",
        CustomerOrderDetailView.as_view(),
        name="order-detail",
    ),
]
