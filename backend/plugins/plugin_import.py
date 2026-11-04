"""Plugin uploader import: upsert plugins as pending_review from an exe batch.

The exe reads an Excel sheet (name, category, description), makes the Plugin_ID and a
``plugin.json`` manifest, uploads the zip (private bucket) and the thumbnail (public bucket)
under ``plugins/<Plugin_ID>/``, then calls this import. Price is never set here: a reviewer
sets it when approving (``PluginService.approve_plugin``).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction

from config.media import media_relative_path, private_object_exists
from plugins.models import (
    PLUGIN_ID_PATTERN,
    Plugin,
    PluginCategory,
    PluginFile,
    _build_unique_slug,
)
from products.catalog_import import CatalogImportService
from products.services import ProductError

logger = logging.getLogger(__name__)

_PLUGIN_ID_RE = re.compile(PLUGIN_ID_PATTERN)
_THUMBNAIL_SUFFIXES = (".webp", ".jpg", ".jpeg", ".png")
# Statuses the importer may rewrite. Anything an admin already acted on is left alone.
_REWRITABLE = frozenset({Plugin.Status.PENDING_REVIEW, Plugin.Status.REJECTED})


class PluginImportSkip(Exception):
    """A row that cannot be imported; ``reason`` is a short code the exe shows."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


@dataclass(frozen=True)
class PluginImportRowResult:
    plugin_id: str
    action: str
    reason: str = ""
    id: str | None = None
    status: str | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"plugin_id": self.plugin_id, "action": self.action}
        if self.reason:
            payload["reason"] = self.reason
        if self.id is not None:
            payload["id"] = self.id
        if self.status is not None:
            payload["status"] = self.status
        return payload


@dataclass(frozen=True)
class PluginImportBatchResult:
    import_batch_id: str
    created: int
    updated: int
    skipped: int
    failed: int
    results: list[PluginImportRowResult]

    def audit_metadata(self) -> dict[str, Any]:
        reasons = {
            row.plugin_id: row.reason
            for row in self.results
            if row.action in ("skipped", "failed")
        }
        return {"skipped_reasons": reasons} if reasons else {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "import_batch_id": self.import_batch_id,
            "created": self.created,
            "updated": self.updated,
            "skipped": self.skipped,
            "failed": self.failed,
            "results": [row.to_dict() for row in self.results],
        }


class PluginImportService:
    @classmethod
    def import_batch(
        cls,
        *,
        import_batch_id: str,
        import_source: str,
        items: list[dict[str, Any]],
        actor_id: str,
    ) -> PluginImportBatchResult:
        results: list[PluginImportRowResult] = []
        counts = {"created": 0, "updated": 0, "skipped": 0, "failed": 0}
        for item in items:
            row = cls._process_item(
                item, import_batch_id=import_batch_id, import_source=import_source
            )
            results.append(row)
            counts[row.action] += 1
        logger.info(
            "plugin_import batch_id=%s actor_id=%s created=%s updated=%s skipped=%s failed=%s",
            import_batch_id,
            actor_id,
            counts["created"],
            counts["updated"],
            counts["skipped"],
            counts["failed"],
        )
        return PluginImportBatchResult(
            import_batch_id=import_batch_id, results=results, **counts
        )

    @classmethod
    def _process_item(
        cls, item: dict[str, Any], *, import_batch_id: str, import_source: str
    ) -> PluginImportRowResult:
        plugin_id = str(item.get("plugin_id") or "")
        try:
            return cls._import_item(
                item, import_batch_id=import_batch_id, import_source=import_source
            )
        except PluginImportSkip as skip:
            return PluginImportRowResult(plugin_id, "skipped", reason=skip.reason)
        except Exception:
            # One bad row must not sink the batch; the log has the traceback.
            logger.exception("plugin_import_row_failed plugin_id=%s", plugin_id)
            return PluginImportRowResult(plugin_id, "failed", reason="import_error")

    @classmethod
    def _import_item(
        cls, item: dict[str, Any], *, import_batch_id: str, import_source: str
    ) -> PluginImportRowResult:
        plugin_id = str(item["plugin_id"]).strip()
        if not _PLUGIN_ID_RE.fullmatch(plugin_id):
            raise PluginImportSkip("invalid_plugin_id")
        name = str(item.get("name") or "").strip()
        if len(name) < 2:
            raise PluginImportSkip("invalid_name")
        description = str(item.get("description") or "").strip()
        if not description:
            raise PluginImportSkip("missing_description")

        category = cls._resolve_category(plugin_id, str(item.get("category_code") or ""))
        media = item.get("media") or {}
        thumbnail_url = cls._check_thumbnail(plugin_id, str(media.get("thumbnail_key") or ""))
        package_key = cls._check_package(plugin_id, str(media.get("package_key") or ""))
        package_size = int(media.get("package_file_size") or 0)
        manifest = item.get("manifest") or {}

        with transaction.atomic():
            existing = Plugin.objects.select_for_update().filter(plugin_id=plugin_id).first()
            if existing is None:
                try:
                    plugin = cls._create(
                        plugin_id=plugin_id,
                        name=name,
                        description=description,
                        category=category,
                        thumbnail_url=thumbnail_url,
                        manifest=manifest,
                        import_batch_id=import_batch_id,
                        import_source=import_source,
                    )
                except IntegrityError:
                    # Two uploads raced on the same new ID; the second one loses.
                    raise PluginImportSkip("plugin_id_in_use") from None
                action = "created"
            else:
                if existing.status not in _REWRITABLE:
                    raise PluginImportSkip("already_reviewed")
                if existing.name.strip().casefold() != name.casefold():
                    # Same ID, different plugin: refuse rather than overwrite someone else's row.
                    raise PluginImportSkip("plugin_id_in_use")
                plugin = cls._update(
                    existing,
                    description=description,
                    category=category,
                    thumbnail_url=thumbnail_url,
                    manifest=manifest,
                    import_batch_id=import_batch_id,
                    import_source=import_source,
                )
                action = "updated"
            cls._sync_package(plugin, package_key, package_size, manifest)
        return PluginImportRowResult(
            plugin_id, action, id=str(plugin.pk), status=plugin.status
        )

    @staticmethod
    def _resolve_category(plugin_id: str, code: str) -> PluginCategory:
        code = code.strip().upper()
        if code != plugin_id.split("-")[1]:
            raise PluginImportSkip("category_mismatch")
        category = PluginCategory.objects.filter(code=code, is_active=True).first()
        if category is None:
            raise PluginImportSkip("unknown_category")
        return category

    @staticmethod
    def _object_key(plugin_id: str, raw_key: str) -> str:
        relative = media_relative_path(raw_key.strip())
        prefix = f"plugins/{plugin_id}/"
        if (
            relative is None
            or ".." in relative
            or not relative.startswith(prefix)
            or relative.endswith("/")
        ):
            raise PluginImportSkip("invalid_object_key")
        return relative

    @classmethod
    def _check_thumbnail(cls, plugin_id: str, raw_key: str) -> str:
        key = cls._object_key(plugin_id, raw_key)
        if not key.lower().endswith(_THUMBNAIL_SUFFIXES):
            raise PluginImportSkip("invalid_object_key")
        try:
            # Checks the object exists, is small enough and decodes as a real image.
            return CatalogImportService._check_image(
                key, reason="invalid_thumbnail", missing="missing_thumbnail_object"
            )
        except ProductError as exc:
            raise PluginImportSkip(exc.message) from None

    @classmethod
    def _check_package(cls, plugin_id: str, raw_key: str) -> str:
        key = cls._object_key(plugin_id, raw_key)
        # The uploader names the package after the ID, and only a .zip is a package.
        if key != f"plugins/{plugin_id}/{plugin_id}.zip":
            raise PluginImportSkip("invalid_object_key")
        if not private_object_exists(key):
            raise PluginImportSkip("missing_package_object")
        return key

    @staticmethod
    def _create(
        *,
        plugin_id: str,
        name: str,
        description: str,
        category: PluginCategory,
        thumbnail_url: str,
        manifest: dict[str, Any],
        import_batch_id: str,
        import_source: str,
    ) -> Plugin:
        return Plugin.objects.create(
            plugin_id=plugin_id,
            name=name[:255],
            slug=_build_unique_slug(Plugin, name, fallback=plugin_id.lower()),
            description=description,
            category=category,
            thumbnail=thumbnail_url,
            # A reviewer sets the real price when approving.
            price=Decimal("0.00"),
            manifest=manifest,
            import_batch_id=import_batch_id,
            import_source=import_source,
            status=Plugin.Status.PENDING_REVIEW,
        )

    @staticmethod
    def _update(
        plugin: Plugin,
        *,
        description: str,
        category: PluginCategory,
        thumbnail_url: str,
        manifest: dict[str, Any],
        import_batch_id: str,
        import_source: str,
    ) -> Plugin:
        plugin.description = description
        plugin.category = category
        plugin.thumbnail = thumbnail_url
        plugin.manifest = manifest
        plugin.import_batch_id = import_batch_id
        plugin.import_source = import_source
        # A fixed re-upload goes back to the queue; the old reason stays until the next decision.
        plugin.status = Plugin.Status.PENDING_REVIEW
        plugin.save(
            update_fields=[
                "description",
                "category",
                "thumbnail",
                "manifest",
                "import_batch_id",
                "import_source",
                "status",
                "updated_at",
            ]
        )
        return plugin

    @staticmethod
    def _sync_package(
        plugin: Plugin, package_key: str, package_size: int, manifest: dict[str, Any]
    ) -> None:
        PluginFile.objects.filter(plugin=plugin).delete()
        PluginFile.objects.create(
            plugin=plugin,
            file_name=package_key.rsplit("/", 1)[-1][:255],
            file_format="zip",
            file_size=max(0, package_size),
            storage_path=package_key,
            version=str(manifest.get("version") or "1.0")[:64],
            is_primary=True,
        )
