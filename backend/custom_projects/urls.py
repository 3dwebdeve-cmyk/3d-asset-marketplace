from django.urls import path

from custom_projects.views import (
    CustomerCustomProjectDetailView,
    CustomerCustomProjectFileUploadView,
    CustomerCustomProjectListCreateView,
    CustomerCustomProjectMessageListCreateView,
)

app_name = "custom_projects"

urlpatterns = [
    path(
        "",
        CustomerCustomProjectListCreateView.as_view(),
        name="customer-custom-project-list-create",
    ),
    path(
        "<uuid:project_id>/",
        CustomerCustomProjectDetailView.as_view(),
        name="customer-custom-project-detail",
    ),
    path(
        "<uuid:project_id>/files/",
        CustomerCustomProjectFileUploadView.as_view(),
        name="customer-custom-project-file-upload",
    ),
    path(
        "<uuid:project_id>/messages/",
        CustomerCustomProjectMessageListCreateView.as_view(),
        name="customer-custom-project-message-list-create",
    ),
]
