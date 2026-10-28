from django.urls import path

from orders.views import (
    CustomerOrderDetailView,
    CustomerOrderInvoiceView,
    CustomerOrderItemLicenseView,
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
        "<uuid:order_id>/items/<uuid:item_id>/license/",
        CustomerOrderItemLicenseView.as_view(),
        name="order-item-license",
    ),
    path(
        "<uuid:order_id>/",
        CustomerOrderDetailView.as_view(),
        name="order-detail",
    ),
]
