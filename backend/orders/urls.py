from django.urls import path

from orders.views import CustomerOrderDetailView, CustomerOrderListView

app_name = "orders"

urlpatterns = [
    path("", CustomerOrderListView.as_view(), name="order-list"),
    path(
        "<uuid:order_id>/",
        CustomerOrderDetailView.as_view(),
        name="order-detail",
    ),
]
