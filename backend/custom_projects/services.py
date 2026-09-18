"""Facade for custom-project domain services (stable import path)."""

from __future__ import annotations

from custom_projects.delivery_service import DeliveryService
from custom_projects.message_service import MessageService
from custom_projects.project_service import ProjectService
from custom_projects.quotation_service import QuotationService
from custom_projects.service_common import (
    ALLOWED_STATUS_TRANSITIONS,
    CustomProjectCreateData,
    CustomProjectError,
    CustomProjectUpdateData,
    ProjectQuotationData,
)

__all__ = [
    "ALLOWED_STATUS_TRANSITIONS",
    "CustomProjectCreateData",
    "CustomProjectError",
    "CustomProjectService",
    "CustomProjectUpdateData",
    "ProjectQuotationData",
]


class CustomProjectService(
    ProjectService,
    QuotationService,
    MessageService,
    DeliveryService,
):
    """Historical single-entry facade used by views, payments, and orders."""
