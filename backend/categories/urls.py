from django.urls import path

from categories.views import (
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
    CategoryDetailView,
    CategoryListView,
)

app_name = "categories"

public_urlpatterns = [
    path("", CategoryListView.as_view(), name="category-list"),
    path("<slug:slug>/", CategoryDetailView.as_view(), name="category-detail"),
]

admin_urlpatterns = [
    path("", AdminCategoryListCreateView.as_view(), name="admin-categories"),
    path(
        "<uuid:category_id>/",
        AdminCategoryDetailView.as_view(),
        name="admin-category-detail",
    ),
]

urlpatterns = public_urlpatterns
