from django.urls import path

from custom_projects.views import (
    AdminCustomProjectDetailView,
    AdminCustomProjectListCreateView,
    AdminCustomProjectQuotationView,
)

app_name = "custom_projects_admin"

urlpatterns = [
    path(
        "",
        AdminCustomProjectListCreateView.as_view(),
        name="admin-custom-project-list-create",
    ),
    path(
        "<uuid:project_id>/",
        AdminCustomProjectDetailView.as_view(),
        name="admin-custom-project-detail",
    ),
    path(
        "<uuid:project_id>/quotation/",
        AdminCustomProjectQuotationView.as_view(),
        name="admin-custom-project-quotation",
    ),
]
