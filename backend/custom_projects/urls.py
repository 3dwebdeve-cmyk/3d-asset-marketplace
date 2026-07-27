from django.urls import path

from custom_projects.views import (
    CustomerCustomProjectDeliveryDownloadView,
    CustomerCustomProjectDeliveryListView,
    CustomerCustomProjectDetailView,
    CustomerCustomProjectFileUploadView,
    CustomerCustomProjectListCreateView,
    CustomerCustomProjectMessageAttachmentDownloadView,
    CustomerCustomProjectMessageListCreateView,
    CustomerCustomProjectMessageMarkReadView,
    CustomerCustomProjectQuotationAcceptView,
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
        "<uuid:project_id>/quotation/accept/",
        CustomerCustomProjectQuotationAcceptView.as_view(),
        name="customer-custom-project-quotation-accept",
    ),
    path(
        "<uuid:project_id>/files/",
        CustomerCustomProjectFileUploadView.as_view(),
        name="customer-custom-project-file-upload",
    ),
    path(
        "<uuid:project_id>/deliveries/",
        CustomerCustomProjectDeliveryListView.as_view(),
        name="customer-custom-project-delivery-list",
    ),
    path(
        "<uuid:project_id>/deliveries/<uuid:delivery_id>/download/",
        CustomerCustomProjectDeliveryDownloadView.as_view(),
        name="customer-custom-project-delivery-download",
    ),
    path(
        "<uuid:project_id>/messages/",
        CustomerCustomProjectMessageListCreateView.as_view(),
        name="customer-custom-project-message-list-create",
    ),
    path(
        "<uuid:project_id>/messages/read/",
        CustomerCustomProjectMessageMarkReadView.as_view(),
        name="customer-custom-project-message-mark-read",
    ),
    path(
        "<uuid:project_id>/messages/<uuid:message_id>/attachments/<uuid:attachment_id>/download/",
        CustomerCustomProjectMessageAttachmentDownloadView.as_view(),
        name="customer-custom-project-message-attachment-download",
    ),
]
