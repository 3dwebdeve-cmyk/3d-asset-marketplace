"""Plugin items on the models import route, POST /api/v1/catalog-ingest/import/.

The Plugin Uploader exe uses the Model Uploader's route and item shape, and marks each plugin
with ``"product_type": "plugin"``. This module turns those items into plugin import items,
imports them with PluginImportService (checked like the plugin route checks them), and adds
their rows to the models response with ``model_id``, the key the exe reads. Model items never
pass through here.
"""

from __future__ import annotations

from typing import Any

from plugins.ingest_serializers import PluginImportItemSerializer
from plugins.plugin_import import (
    PluginImportBatchResult,
    PluginImportRowResult,
    PluginImportService,
)

PLUGIN_PRODUCT_TYPE = "plugin"
# The Model Uploader sends no product_type; "model" is accepted too.
MODEL_PRODUCT_TYPES = ("", "model")
INVALID_PRODUCT_TYPE = "invalid_product_type"
_COUNTS = ("created", "updated", "skipped", "failed")

# The first field the plugin item check refused, as the reason the exe shows.
_FIELD_REASONS = {
    "plugin_id": "invalid_plugin_id",
    "name": "invalid_name",
    "category_code": "category_mismatch",
    "description": "missing_description",
    "manifest": "invalid_manifest",
    "media": "invalid_object_key",
}


def split_by_product_type(
    validated_items: list[dict[str, Any]], raw_items: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """(model items, plugin items, items of an unknown product type), in request order.

    Model items are the validated ones, exactly as before. Plugin items are taken as sent,
    because the models serializer drops the plugin fields (is_free, manifest, package size).
    """
    models, plugins, unknown = [], [], []
    for item, raw in zip(validated_items, raw_items, strict=True):
        product_type = item.pop("product_type", "")
        if product_type == PLUGIN_PRODUCT_TYPE:
            plugins.append(raw)
        elif product_type in MODEL_PRODUCT_TYPES:
            models.append(item)
        else:
            unknown.append(item)
    return models, plugins, unknown


def to_plugin_item(raw: dict[str, Any]) -> dict[str, Any]:
    """The exe's item as a plugin import item. The category code is the middle of the ID
    (PLUG-MAX-000001 -> MAX); an explicit category_code is checked against it."""
    model_id = str(raw.get("model_id") or "").strip().upper()
    parts = model_id.split("-")
    media = raw.get("media") if isinstance(raw.get("media"), dict) else {}
    manifest = raw.get("manifest")
    return {
        "plugin_id": model_id,
        "name": raw.get("name") or "",
        "category_code": raw.get("category_code") or (parts[1] if len(parts) == 3 else ""),
        "description": raw.get("description") or "",
        "manifest": {} if manifest is None else manifest,
        "media": {
            "thumbnail_key": media.get("thumbnail_key") or "",
            "package_key": media.get("package_key") or "",
            "package_file_size": media.get("package_file_size") or 0,
        },
    }


def import_plugin_items(
    raw_items: list[dict[str, Any]], *, import_batch_id: str, import_source: str, actor_id: str
) -> PluginImportBatchResult:
    """Check each item as the plugin route does, then import the valid ones."""
    items: list[dict[str, Any]] = []
    refused: list[PluginImportRowResult] = []
    for raw in raw_items:
        serializer = PluginImportItemSerializer(data=to_plugin_item(raw))
        if serializer.is_valid():
            items.append({**serializer.validated_data, "is_free": raw.get("is_free") is True})
        else:
            reason = _FIELD_REASONS.get(next(iter(serializer.errors)), "invalid_plugin_id")
            plugin_id = serializer.initial_data["plugin_id"]
            refused.append(PluginImportRowResult(plugin_id, "skipped", reason=reason))
    batch = PluginImportService.import_batch(
        import_batch_id=import_batch_id,
        import_source=import_source,
        items=items,
        actor_id=actor_id,
    )
    return PluginImportBatchResult(
        import_batch_id=import_batch_id,
        created=batch.created,
        updated=batch.updated,
        skipped=batch.skipped + len(refused),
        failed=batch.failed,
        results=[*refused, *batch.results],
    )


def add_other_rows(
    body: dict[str, Any],
    audit: dict[str, Any],
    *,
    plugins: PluginImportBatchResult | None,
    plugin_items: list[dict[str, Any]],
    unknown: list[dict[str, Any]],
) -> None:
    """Add the plugin rows and the unknown-type rows to the models response and audit data,
    so the counts, the exe's report and the admin Imports panel cover every item."""
    rows = [{"model_id": row.plugin_id, **row.to_dict()} for row in plugins.results] if plugins else []
    rows += [
        {"model_id": item.get("model_id", ""), "action": "skipped", "reason": INVALID_PRODUCT_TYPE}
        for item in unknown
    ]
    body["results"].extend(rows)
    for key in _COUNTS:
        body[key] += sum(1 for row in rows if row["action"] == key)

    names = {to_plugin_item(raw)["plugin_id"]: str(raw.get("name") or "") for raw in plugin_items}
    names.update({item.get("model_id", ""): item.get("name", "") for item in unknown})
    refused = [row for row in rows if row["action"] in ("skipped", "failed")]
    if refused:
        audit.setdefault("skipped_reasons", {}).update(
            {row["model_id"]: row.get("reason", "") for row in refused}
        )
        audit.setdefault("refused_names", {}).update(
            {row["model_id"]: names.get(row["model_id"], "") for row in refused}
        )
