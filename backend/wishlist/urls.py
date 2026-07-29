from django.urls import path

from wishlist.views import WishlistDetailView, WishlistListCreateView

app_name = "wishlist"

urlpatterns = [
    path("", WishlistListCreateView.as_view(), name="wishlist-list-create"),
    path("<uuid:item_id>/", WishlistDetailView.as_view(), name="wishlist-detail"),
]
