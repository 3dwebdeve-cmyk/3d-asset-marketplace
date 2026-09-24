from django.urls import path

from coupons.views import AdminCouponDetailView, AdminCouponListCreateView

app_name = "coupons_admin"

urlpatterns = [
    path("", AdminCouponListCreateView.as_view(), name="admin-coupons"),
    path(
        "<uuid:coupon_id>/",
        AdminCouponDetailView.as_view(),
        name="admin-coupon-detail",
    ),
]
