"""Plugin uploader import: upsert plugins as pending_review from an exe batch.

The exe reads an Excel sheet (name, category, description), makes the Plugin_ID and a
``plugin.json`` manifest, uploads the zip (private bucket) and the thumbnail (public bucket)
under ``plugins/<Plugin_ID>/``, then calls this import. Price is never set here: a reviewer
sets it when approving (``PluginService.approve_plugin``).

The sheet's name, description and category are used on a plugin's first upload only. After
that the administrator owns them (edited in /console), and a re-upload changes the files only.
A published plugin that is uploaded again stays on sale with its new files and waits in the
review queue (``pending_update``), the same way models do.
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
# Row warning: a re-upload kept the name or description an administrator owns.
CONSOLE_TEXT_KEPT = "console_text_kept"
# Row warning: the plugin is live; it stays on sale and waits in the review queue as an update.
LIVE_UPDATE_IN_QA = "live_update_in_qa"
# QA note on a live plugin whose re-upload the website refused. The uploader replaces the
# files in R2 before it calls the import, so the store may already serve the new files.
_REFUSED_NOTE_PREFIX = "Re-upload "


def _without_refusal_notes(notes: str) -> str:
    return "\n".join(
        line for line in (notes or "").splitlines() if not line.startswith(_REFUSED_NOTE_PREFIX)
    ).strip()


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
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"plugin_id": self.plugin_id, "action": self.action}
        if self.reason:
            payload["reason"] = self.reason
        if self.id is not None:
            payload["id"] = self.id
        if self.status is not None:
            payload["status"] = self.status
        if self.warnings:
            payload["warnings"] = list(self.warnings)
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
            row = PluginImportRowResult(plugin_id, "skipped", reason=skip.reason)
        except Exception:
            # One bad row must not sink the batch; the log has the traceback.
            logger.exception("plugin_import_row_failed plugin_id=%s", plugin_id)
            row = PluginImportRowResult(plugin_id, "failed", reason="import_error")
        if cls._flag_refused_live_update(row, import_batch_id=import_batch_id):
            row = PluginImportRowResult(
                row.plugin_id, row.action, reason=row.reason, warnings=(LIVE_UPDATE_IN_QA,)
            )
        return row

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

        category_code = cls._check_category_code(plugin_id, str(item.get("category_code") or ""))
        # The administrator owns an existing plugin's category, like its text, so the sheet's
        # category is only looked up for a new plugin (a switched-off one does not block a
        # re-upload).
        category: PluginCategory | None = None
        if not Plugin.objects.filter(plugin_id=plugin_id).exists():
            category = cls._resolve_category(category_code)
        media = item.get("media") or {}
        thumbnail_url = cls._check_thumbnail(plugin_id, str(media.get("thumbnail_key") or ""))
        package_key = cls._check_package(plugin_id, str(media.get("package_key") or ""))
        package_size = int(media.get("package_file_size") or 0)
        manifest = item.get("manifest") or {}
        warnings: list[str] = []

        with transaction.atomic():
            existing = Plugin.objects.select_for_update().filter(plugin_id=plugin_id).first()
            if existing is None:
                try:
                    plugin = cls._create(
                        plugin_id=plugin_id,
                        name=name,
                        description=description,
                        category=category or cls._resolve_category(category_code),
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
                if not cls._same_plugin(existing, name):
                    # Same ID, different plugin: refuse rather than overwrite someone else's row.
                    raise PluginImportSkip("plugin_id_in_use")
                live_update = existing.status == Plugin.Status.PUBLISHED
                if cls._sheet_text_differs(existing, name=name, description=description):
                    warnings.append(CONSOLE_TEXT_KEPT)
                plugin = cls._update(
                    existing,
                    thumbnail_url=thumbnail_url,
                    manifest=manifest,
                    import_batch_id=import_batch_id,
                    import_source=import_source,
                    live_update=live_update,
                )
                if live_update:
                    warnings.append(LIVE_UPDATE_IN_QA)
                action = "updated"
            cls._sync_package(plugin, package_key, package_size, manifest)
        return PluginImportRowResult(
            plugin_id, action, id=str(plugin.pk), status=plugin.status, warnings=tuple(warnings)
        )

    @staticmethod
    def _check_category_code(plugin_id: str, code: str) -> str:
        code = code.strip().upper()
        if code != plugin_id.split("-")[1]:
            raise PluginImportSkip("category_mismatch")
        return code

    @staticmethod
    def _resolve_category(code: str) -> PluginCategory:
        category = PluginCategory.objects.filter(code=code, is_active=True).first()
        if category is None:
            raise PluginImportSkip("unknown_category")
        return category

    @staticmethod
    def _same_plugin(plugin: Plugin, sheet_name: str) -> bool:
        """The sheet row is this plugin: its name matches the plugin's current name, or the
        name it was uploaded under (kept in the manifest), so a rename in /console does not
        block the next upload."""
        known = {
            str(value or "").strip().casefold()
            for value in (plugin.name, (plugin.manifest or {}).get("name"))
        }
        known.discard("")
        return sheet_name.casefold() in known

    @staticmethod
    def _sheet_text_differs(plugin: Plugin, *, name: str, description: str) -> bool:
        """True when the sheet's text differs from the plugin's, so the uploader's report can
        say the website kept the administrator's version."""
        return name != plugin.name.strip() or description != (plugin.description or "").strip()

    @staticmethod
    def _manifest_version(manifest: dict[str, Any]) -> str:
        return str(manifest.get("version") or "").strip()[:64]

    @classmethod
    def _flag_refused_live_update(cls, row: PluginImportRowResult, *, import_batch_id: str) -> bool:
        """Put a live plugin in the review queue when the website refused its re-upload.

        The uploader sends the files to R2 before it calls the import, so the store may
        already serve the refused files. Returns True when a live plugin was flagged.
        """
        if row.action not in ("skipped", "failed") or not _PLUGIN_ID_RE.fullmatch(row.plugin_id):
            return False
        plugin = Plugin.objects.filter(
            plugin_id=row.plugin_id, status=Plugin.Status.PUBLISHED
        ).first()
        if plugin is None:
            return False
        note = (
            f"{_REFUSED_NOTE_PREFIX}{import_batch_id} was refused ({row.reason or row.action}); "
            "the files in R2 may already have changed. Check the files, then approve or reject."
        )
        plugin.qa_notes = f"{_without_refusal_notes(plugin.qa_notes)}\n{note}".strip()
        plugin.pending_update = True
        plugin.save(update_fields=["pending_update", "qa_notes", "updated_at"])
        logger.warning(
            "plugin_import_live_update_refused plugin_id=%s batch_id=%s reason=%s",
            row.plugin_id,
            import_batch_id,
            row.reason,
        )
        return True

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

    @classmethod
    def _create(
        cls,
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
            version=cls._manifest_version(manifest) or "1.0",
            manifest=manifest,
            import_batch_id=import_batch_id,
            import_source=import_source,
            status=Plugin.Status.PENDING_REVIEW,
        )

    @classmethod
    def _update(
        cls,
        plugin: Plugin,
        *,
        thumbnail_url: str,
        manifest: dict[str, Any],
        import_batch_id: str,
        import_source: str,
        live_update: bool,
    ) -> Plugin:
        """Update a re-uploaded plugin's files only; the administrator owns its text.

        Name, description and category come from the sheet on the first upload and are
        edited in /console after that. The version follows the new package. Any plugin goes
        back to the queue (the old reject reason stays until the next decision), except a
        live one (``live_update``): it stays published and waits as an update.
        """
        plugin.thumbnail = thumbnail_url
        plugin.manifest = manifest
        plugin.version = cls._manifest_version(manifest) or plugin.version
        plugin.import_batch_id = import_batch_id
        plugin.import_source = import_source
        if not live_update:
            plugin.status = Plugin.Status.PENDING_REVIEW
        plugin.pending_update = live_update
        # A successful upload clears an earlier "re-upload refused" note.
        plugin.qa_notes = _without_refusal_notes(plugin.qa_notes)
        plugin.save(
            update_fields=[
                "thumbnail",
                "manifest",
                "version",
                "import_batch_id",
                "import_source",
                "status",
                "pending_update",
                "qa_notes",
                "updated_at",
            ]
        )
        return plugin

    @staticmethod
    def _sync_package(
        plugin: Plugin, package_key: str, package_size: int, manifest: dict[str, Any]
    ) -> None:
        """One primary zip per imported plugin. The existing row is updated in place, so a
        live plugin's file ID (part of buyers' download links) does not change."""
        values = {
            "file_name": package_key.rsplit("/", 1)[-1][:255],
            "file_format": "zip",
            "file_size": max(0, package_size),
            "version": str(manifest.get("version") or "1.0")[:64],
            "is_primary": True,
        }
        row = PluginFile.objects.filter(plugin=plugin, storage_path=package_key).first()
        others = PluginFile.objects.filter(plugin=plugin)
        if row is not None:
            others = others.exclude(pk=row.pk)
        others.delete()
        if row is None:
            PluginFile.objects.create(plugin=plugin, storage_path=package_key, **values)
            return
        for field_name, value in values.items():
            setattr(row, field_name, value)
        row.save(update_fields=[*values, "updated_at"])
