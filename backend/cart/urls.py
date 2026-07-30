from django.urls import path

from cart.views import CartCouponView, CartItemDetailView, CartView

app_name = "cart"

urlpatterns = [
    path("", CartView.as_view(), name="cart-detail"),
    path("coupon/", CartCouponView.as_view(), name="cart-coupon"),
    path("items/<uuid:item_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
]
