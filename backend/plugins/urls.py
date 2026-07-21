from django.urls import path

from plugins.views import (
    AdminPluginCategoryDetailView,
    AdminPluginCategoryListCreateView,
    AdminPluginDetailView,
    AdminPluginFileDetailView,
    AdminPluginFileUploadView,
    AdminPluginImageDetailView,
    AdminPluginImageUploadView,
    AdminPluginListCreateView,
    PluginCategoryDetailView,
    PluginCategoryListView,
    PluginDetailView,
    PluginListView,
)

app_name = "plugins"

urlpatterns = [
    path("", PluginListView.as_view(), name="plugin-list"),
    path("<slug:slug>/", PluginDetailView.as_view(), name="plugin-detail"),
]

category_urlpatterns = [
    path("", PluginCategoryListView.as_view(), name="plugin-category-list"),
    path(
        "<slug:slug>/",
        PluginCategoryDetailView.as_view(),
        name="plugin-category-detail",
    ),
]

admin_urlpatterns = [
    path("", AdminPluginListCreateView.as_view(), name="admin-plugins"),
    path(
        "<uuid:plugin_id>/",
        AdminPluginDetailView.as_view(),
        name="admin-plugin-detail",
    ),
    path(
        "<uuid:plugin_id>/images/",
        AdminPluginImageUploadView.as_view(),
        name="admin-plugin-images",
    ),
    path(
        "<uuid:plugin_id>/images/<uuid:image_id>/",
        AdminPluginImageDetailView.as_view(),
        name="admin-plugin-image-detail",
    ),
    path(
        "<uuid:plugin_id>/files/",
        AdminPluginFileUploadView.as_view(),
        name="admin-plugin-files",
    ),
    path(
        "<uuid:plugin_id>/files/<uuid:file_id>/",
        AdminPluginFileDetailView.as_view(),
        name="admin-plugin-file-detail",
    ),
]

admin_category_urlpatterns = [
    path(
        "",
        AdminPluginCategoryListCreateView.as_view(),
        name="admin-plugin-categories",
    ),
    path(
        "<uuid:category_id>/",
        AdminPluginCategoryDetailView.as_view(),
        name="admin-plugin-category-detail",
    ),
]
