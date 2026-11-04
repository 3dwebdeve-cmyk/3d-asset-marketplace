"""Plugin uploader exe routes, mounted at /api/v1/catalog-ingest/plugins/ (API key only)."""

from __future__ import annotations

import logging
import re

from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.api_keys import SCOPE_PLUGINS
from accounts.authentication import CatalogApiKeyAuthentication
from accounts.permissions import CatalogIngestIPAllowed, HasCatalogApiKey
from accounts.security_log import log_admin_action
from accounts.throttles import CatalogIngestRateThrottle
from plugins.ingest_serializers import PluginImportEnvelopeSerializer
from plugins.models import PLUGIN_ID_PATTERN, Plugin, PluginCategory
from plugins.plugin_import import PluginImportService

logger = logging.getLogger(__name__)


class _PluginIngestView(APIView):
    authentication_classes = [CatalogApiKeyAuthentication]
    permission_classes = [CatalogIngestIPAllowed, HasCatalogApiKey]
    throttle_classes = [CatalogIngestRateThrottle]
    ingest_scope = SCOPE_PLUGINS


def last_plugin_sequence() -> int:
    """Highest 6-digit number used by any Plugin_ID so far (0 when there are none)."""
    pattern = re.compile(PLUGIN_ID_PATTERN)
    highest = 0
    for plugin_id in Plugin.objects.exclude(plugin_id__isnull=True).values_list(
        "plugin_id", flat=True
    ):
        if plugin_id and pattern.fullmatch(plugin_id):
            highest = max(highest, int(plugin_id.rsplit("-", 1)[1]))
    return highest


class PluginIngestNextIdsView(_PluginIngestView):
    """GET: the category codes and the next free number, so the exe never reuses an ID."""

    def get(self, request: Request) -> Response:
        categories = PluginCategory.objects.filter(
            is_active=True, code__isnull=False
        ).order_by("name")
        last = last_plugin_sequence()
        return Response(
            {
                "last_sequence": last,
                "next_sequence": last + 1,
                "categories": [
                    {"code": category.code, "name": category.name} for category in categories
                ],
            }
        )


class PluginIngestImportView(_PluginIngestView):
    """POST: import a batch of plugins as pending_review. Price is set later by a reviewer."""

    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        serializer = PluginImportEnvelopeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        batch = PluginImportService.import_batch(
            import_batch_id=data["import_batch_id"],
            import_source=data.get("import_source") or "plugin-uploader",
            items=data["items"],
            actor_id=str(request.user.pk),
        )
        key_prefix = request.auth.key_prefix
        logger.info(
            "plugin_ingest key_prefix=%s batch_id=%s items=%s created=%s updated=%s "
            "skipped=%s failed=%s",
            key_prefix,
            data["import_batch_id"],
            len(data["items"]),
            batch.created,
            batch.updated,
            batch.skipped,
            batch.failed,
        )
        log_admin_action(
            action="plugin_ingest_import",
            actor_id=str(request.user.pk),
            target_id=data["import_batch_id"],
            metadata={
                "key_prefix": key_prefix,
                "created": batch.created,
                "updated": batch.updated,
                "skipped": batch.skipped,
                "failed": batch.failed,
                **batch.audit_metadata(),
            },
        )
        return Response(batch.to_dict(), status=status.HTTP_200_OK)
