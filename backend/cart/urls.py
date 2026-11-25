from django.urls import path

from cart.views import BundleQuoteView, CartItemDetailView, CartView

app_name = "cart"

urlpatterns = [
    path("", CartView.as_view(), name="cart-detail"),
    path("items/<uuid:item_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
    path("bundle-quote/", BundleQuoteView.as_view(), name="cart-bundle-quote"),
]
