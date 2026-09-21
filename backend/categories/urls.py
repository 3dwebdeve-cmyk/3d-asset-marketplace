from django.urls import path

from categories.views import (
    AdminCategoryDetailView,
    AdminCategoryListCreateView,
    CategoryClickView,
    CategoryDetailView,
    CategoryListView,
    CategoryTrendingView,
)

app_name = "categories"

public_urlpatterns = [
    path("", CategoryListView.as_view(), name="category-list"),
    path("trending/", CategoryTrendingView.as_view(), name="category-trending"),
    path(
        "<uuid:category_id>/click/",
        CategoryClickView.as_view(),
        name="category-click",
    ),
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
