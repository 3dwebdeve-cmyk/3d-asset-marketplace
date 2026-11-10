"""Plugin review actions: approve (set price), reject (with reason), requeue.

Every route is admin-only and throttled like the other admin plugin writes, and each
decision is written to the admin audit log. The reviewer is always the signed-in admin.
"""

from __future__ import annotations

from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import AdminPluginWriteRateThrottle
from config.api_helpers import domain_error_response
from plugins.review_serializers import PluginApproveSerializer, PluginRejectSerializer
from plugins.serializers import PluginAdminSerializer
from plugins.services import PluginError, PluginService


class _PluginReviewView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]
    parser_classes = [JSONParser]

    @staticmethod
    def _get_plugin(plugin_id: UUID):
        try:
            return PluginService.get_for_mutation_by_id(plugin_id)
        except PluginError as exc:
            raise NotFound(exc.message) from exc


class AdminPluginApproveView(_PluginReviewView):
    """POST /api/v1/admin/plugins/<id>/approve/ — pending_review → published, or a live
    plugin's update approved (stays published)."""

    def post(self, request: Request, plugin_id: UUID) -> Response:
        plugin = self._get_plugin(plugin_id)
        live_update = PluginService.is_live_update(plugin)
        serializer = PluginApproveSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            updated = PluginService.approve_plugin(
                plugin,
                reviewer=request.user,
                price=data.get("price"),
                currency=data.get("currency") or None,
                discount_price=data.get("discount_price"),
                qa_notes=data.get("qa_notes"),
            )
        except PluginError as exc:
            return domain_error_response(exc, default_code="plugin_error")
        log_admin_action(
            action="plugin_approve",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
            metadata={
                "price": str(updated.price),
                "plugin_id": updated.plugin_id,
                "live_update": live_update,
            },
        )
        return Response(PluginAdminSerializer(updated).data, status=status.HTTP_200_OK)


class AdminPluginRejectView(_PluginReviewView):
    """POST /api/v1/admin/plugins/<id>/reject/ — pending_review → rejected, or a live
    plugin's update rejected (taken off the store)."""

    def post(self, request: Request, plugin_id: UUID) -> Response:
        plugin = self._get_plugin(plugin_id)
        live_update = PluginService.is_live_update(plugin)
        serializer = PluginRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            updated = PluginService.reject_plugin(
                plugin,
                reviewer=request.user,
                reason=data["reason"],
                qa_notes=data.get("qa_notes"),
            )
        except PluginError as exc:
            return domain_error_response(exc, default_code="plugin_error")
        log_admin_action(
            action="plugin_reject",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
            metadata={"plugin_id": updated.plugin_id, "live_update": live_update},
        )
        return Response(PluginAdminSerializer(updated).data, status=status.HTTP_200_OK)


class AdminPluginRequeueView(_PluginReviewView):
    """POST /api/v1/admin/plugins/<id>/requeue/ — rejected → pending_review."""

    def post(self, request: Request, plugin_id: UUID) -> Response:
        plugin = self._get_plugin(plugin_id)
        try:
            updated = PluginService.requeue_plugin(plugin)
        except PluginError as exc:
            return domain_error_response(exc, default_code="plugin_error")
        log_admin_action(
            action="plugin_requeue",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
            metadata={"plugin_id": updated.plugin_id},
        )
        return Response(PluginAdminSerializer(updated).data, status=status.HTTP_200_OK)
