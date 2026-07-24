from django.urls import path

from custom_projects.views import (
    AdminCustomProjectDeliveryDownloadView,
    AdminCustomProjectDeliveryListCreateView,
    AdminCustomProjectDetailView,
    AdminCustomProjectFileDownloadView,
    AdminCustomProjectListCreateView,
    AdminCustomProjectMessageAttachmentDownloadView,
    AdminCustomProjectMessageListCreateView,
    AdminCustomProjectMessageMarkReadView,
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
    path(
        "<uuid:project_id>/deliveries/",
        AdminCustomProjectDeliveryListCreateView.as_view(),
        name="admin-custom-project-delivery-list-create",
    ),
    path(
        "<uuid:project_id>/deliveries/<uuid:delivery_id>/download/",
        AdminCustomProjectDeliveryDownloadView.as_view(),
        name="admin-custom-project-delivery-download",
    ),
    path(
        "<uuid:project_id>/files/<uuid:file_id>/download/",
        AdminCustomProjectFileDownloadView.as_view(),
        name="admin-custom-project-file-download",
    ),
    path(
        "<uuid:project_id>/messages/",
        AdminCustomProjectMessageListCreateView.as_view(),
        name="admin-custom-project-message-list-create",
    ),
    path(
        "<uuid:project_id>/messages/read/",
        AdminCustomProjectMessageMarkReadView.as_view(),
        name="admin-custom-project-message-mark-read",
    ),
    path(
        "<uuid:project_id>/messages/<uuid:message_id>/attachments/<uuid:attachment_id>/download/",
        AdminCustomProjectMessageAttachmentDownloadView.as_view(),
        name="admin-custom-project-message-attachment-download",
    ),
]
