from django.urls import path

from orders.views import (
    AdminOrderDetailView,
    AdminOrderInvoiceView,
    AdminOrderListCreateView,
)

app_name = "orders_admin"

urlpatterns = [
    path(
        "",
        AdminOrderListCreateView.as_view(),
        name="admin-order-list-create",
    ),
    path(
        "<uuid:order_id>/invoice/",
        AdminOrderInvoiceView.as_view(),
        name="admin-order-invoice",
    ),
    path(
        "<uuid:order_id>/",
        AdminOrderDetailView.as_view(),
        name="admin-order-detail",
    ),
]
