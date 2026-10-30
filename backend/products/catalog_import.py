"""Feature 16 Phase 6 — Catalog Import: gate + upsert pending_review by SKU."""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from django.core.exceptions import SuspiciousFileOperation, ValidationError
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q

from categories.models import Category
from config.media import FREE_MODELS_PREFIX, media_relative_path, package_object_exists
from config.storages import build_public_media_url, get_public_storage
from config.upload_security import (
    SCAN_MALWARE_FOUND,
    SCAN_UNAVAILABLE,
    inspect_product_content,
    scan_error_code,
)
from products.models import PRODUCT_SKU_REGEX, Product, ProductFile, ProductImage
from products.services import (
    ProductCreateData,
    ProductError,
    ProductService,
    ProductUpdateData,
    preview_reduction_error,
)
from products.upload_rules import PRODUCT_PREVIEW_MAX_BYTES, validate_image_bytes

logger = logging.getLogger(__name__)

_GLB_CHECKSUM_RE = re.compile(r"^[a-fA-F0-9]{64}$")
_QA_READY = frozenset({"Ready for QA", "Approved"})
_EXPORT_SUCCESS = "Success"
_PACKAGEABLE_EXPORTS = ("fbx", "obj", "max")
# A package must hold at least one model format besides the web preview formats.
_PREVIEW_ONLY_FORMATS = frozenset({"glb", "gltf"})
_STORAGE_ERRORS = (OSError, ValueError, SuspiciousFileOperation, BotoCoreError, ClientError)
# Pipeline renders can be larger than the admin form's 5 MB upload limit.
_IMPORT_IMAGE_MAX_BYTES = 25 * 1024 * 1024
# Copies older imports made under models/<sku>/: "<image name>-<12 hex>.webp" and
# "preview-<32 hex>.glb". The import no longer makes them; re-imports clean them up.
_IMPORT_COPY_KEY_RE = re.compile(
    r"models/(?P<sku>[^/]+)/(?:.+-[0-9a-f]{12}\.webp|preview-[0-9a-f]{32}\.glb)"
)
PREVIEW_NOT_SCANNED_NOTE = "Preview imported without a virus scan (no scanner configured)."
_UPSERTABLE_STATUSES = frozenset(
    {
        Product.Status.DRAFT,
        Product.Status.PENDING_REVIEW,
        Product.Status.REJECTED,
    }
)


@dataclass(frozen=True)
class CatalogImportRowResult:
    model_id: str
    action: str
    reason: str = ""
    product_id: str | None = None
    status: str | None = None
    # The row was imported, but something deserves a look (for example "preview_unchecked").
    warning: str = ""
    # Every warning for the row, including `warning` and "subcategory_not_found".
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model_id": self.model_id,
            "action": self.action,
        }
        if self.reason:
            payload["reason"] = self.reason
        if self.warning:
            payload["warning"] = self.warning
        if self.product_id is not None:
            payload["product_id"] = self.product_id
        if self.status is not None:
            payload["status"] = self.status
        if self.warnings:
            payload["warnings"] = list(self.warnings)
        return payload


@dataclass(frozen=True)
class CatalogImportBatchResult:
    import_batch_id: str
    created: int
    updated: int
    skipped: int
    failed: int
    results: list[CatalogImportRowResult]

    @property
    def not_scanned_model_ids(self) -> list[str]:
        """Rows imported without a virus scan, for the audit log."""
        return [row.model_id for row in self.results if "preview_not_scanned" in row.warnings]

    def audit_metadata(self) -> dict[str, Any]:
        if not self.not_scanned_model_ids:
            return {}
        return {"preview_not_scanned": True, "not_scanned_model_ids": self.not_scanned_model_ids}

    def to_dict(self) -> dict[str, Any]:
        return {
            "import_batch_id": self.import_batch_id,
            "created": self.created,
            "updated": self.updated,
            "skipped": self.skipped,
            "failed": self.failed,
            "results": [row.to_dict() for row in self.results],
        }


class CatalogImportService:
    """Process a bridge catalog-import batch: gate rows, upsert pending_review."""

    @classmethod
    def import_batch(
        cls,
        *,
        import_batch_id: str,
        import_source: str,
        items: list[dict[str, Any]],
        actor_id: str,
    ) -> CatalogImportBatchResult:
        results: list[CatalogImportRowResult] = []
        created = updated = skipped = failed = 0

        for item in items:
            row = cls._process_item(
                item,
                import_batch_id=import_batch_id,
                import_source=import_source,
            )
            results.append(row)
            if row.action == "created":
                created += 1
            elif row.action == "updated":
                updated += 1
            elif row.action == "skipped":
                skipped += 1
            else:
                failed += 1

        logger.info(
            "catalog_import batch_id=%s actor_id=%s created=%s updated=%s "
            "skipped=%s failed=%s",
            import_batch_id,
            actor_id,
            created,
            updated,
            skipped,
            failed,
        )

        return CatalogImportBatchResult(
            import_batch_id=import_batch_id,
            created=created,
            updated=updated,
            skipped=skipped,
            failed=failed,
            results=results,
        )

    @classmethod
    def _process_item(
        cls,
        item: dict[str, Any],
        *,
        import_batch_id: str,
        import_source: str,
    ) -> CatalogImportRowResult:
        warnings: list[str] = []
        row = cls._import_item(
            item,
            import_batch_id=import_batch_id,
            import_source=import_source,
            warnings=warnings,
        )
        # `warnings` lists every warning; `warning` keeps its single value for older callers.
        if row.warning:
            warnings.append(row.warning)
        return replace(row, warnings=tuple(warnings)) if warnings else row

    @classmethod
    def _import_item(
        cls,
        item: dict[str, Any],
        *,
        import_batch_id: str,
        import_source: str,
        warnings: list[str],
    ) -> CatalogImportRowResult:
        # models/<sku>/ is a paid model (zip in the private bucket); free-models/<sku>/ is
        # a free one with every file, zip included, in the public bucket.
        prefix = str(item.get("r2_key_prefix") or "").strip()
        if prefix.startswith(FREE_MODELS_PREFIX):
            item = {**item, "price": "0", "discount_price": None}

        raw_model_id = str(item.get("model_id") or "").strip()
        display_id = raw_model_id.upper() if raw_model_id else ""

        gate_reason = cls._gate_item(item)
        if gate_reason is not None:
            return CatalogImportRowResult(
                model_id=display_id or raw_model_id or "UNKNOWN",
                action="skipped",
                reason=gate_reason,
            )

        sku = Product.normalize_sku(raw_model_id)
        if sku is None:
            return CatalogImportRowResult(
                model_id=display_id or "UNKNOWN",
                action="skipped",
                reason="invalid_model_id",
            )

        category = cls.resolve_category(
            str(item.get("category") or ""),
            str(item.get("subcategory") or ""),
            warnings=warnings,
        )
        if category is None:
            return CatalogImportRowResult(
                model_id=sku,
                action="skipped",
                reason="category_unmapped",
            )

        media = item.get("media") or {}
        try:
            media_pointers = cls._build_media_pointers(sku, media, prefix=prefix)
        except ProductError as exc:
            return CatalogImportRowResult(
                model_id=sku,
                action="skipped",
                reason=exc.message if exc.field == "object_key" else "invalid_object_key",
            )

        try:
            existing = ProductService.get_by_sku(sku)
        except ProductError:
            existing = None

        if existing is not None:
            if existing.status == Product.Status.PUBLISHED:
                return CatalogImportRowResult(
                    model_id=sku,
                    action="skipped",
                    reason="published_sku",
                )
            if existing.status == Product.Status.ARCHIVED:
                return CatalogImportRowResult(
                    model_id=sku,
                    action="skipped",
                    reason="archived_sku",
                )
            if existing.status not in _UPSERTABLE_STATUSES:
                return CatalogImportRowResult(
                    model_id=sku,
                    action="skipped",
                    reason="published_sku",
                )

        # Catch a typo or failed upload now rather than at approval.
        package_key = media_pointers["package_key"]
        if package_key is not None and not package_object_exists(package_key):
            return CatalogImportRowResult(
                model_id=sku,
                action="skipped",
                reason="missing_package_object",
            )

        # The preview first: a rejected preview then costs no image reads. Neither check
        # writes to storage (only a preview found to be malware is deleted), so a skipped
        # row leaves R2 as the uploader left it.
        try:
            media_pointers = cls._check_preview(sku, item, media_pointers, existing)
        except ProductError as exc:
            return CatalogImportRowResult(model_id=sku, action="skipped", reason=exc.message)

        try:
            media_pointers = cls._check_images(sku, media_pointers, existing)
        except ProductError as exc:
            return CatalogImportRowResult(model_id=sku, action="skipped", reason=exc.message)

        previous_copies = cls._import_copies(sku, existing)

        try:
            with transaction.atomic():
                if existing is None:
                    product = cls._create_product(
                        item,
                        sku=sku,
                        category=category,
                        import_batch_id=import_batch_id,
                        import_source=import_source,
                        media_pointers=media_pointers,
                    )
                    action = "created"
                else:
                    product = cls._update_product(
                        existing,
                        item,
                        sku=sku,
                        category=category,
                        import_batch_id=import_batch_id,
                        import_source=import_source,
                        media_pointers=media_pointers,
                    )
                    action = "updated"
                if product.preview_triangle_count != media_pointers["preview_triangle_count"]:
                    product.preview_triangle_count = media_pointers["preview_triangle_count"]
                    product.save(update_fields=["preview_triangle_count", "updated_at"])
                cls._sync_gallery(
                    product,
                    media_pointers["gallery_urls"],
                    replace=media_pointers["replace_gallery"],
                )
                cls._sync_package(product, media_pointers)
                cls._sync_scan_note(product, media_pointers["preview_not_scanned"])
        except ProductError as exc:
            return CatalogImportRowResult(
                model_id=sku,
                action="failed",
                reason=exc.field or "product_error",
            )
        except Exception:
            logger.exception(
                "catalog_import_row_failed model_id=%s batch_id=%s",
                sku,
                import_batch_id,
            )
            return CatalogImportRowResult(
                model_id=sku,
                action="failed",
                reason="internal_error",
            )

        cls._delete_unreferenced_copies(previous_copies)
        if media_pointers["preview_not_scanned"]:
            warnings.append("preview_not_scanned")

        return CatalogImportRowResult(
            model_id=sku,
            action=action,
            product_id=str(product.pk),
            status=product.status,
            warning="preview_unchecked" if media_pointers["preview_unchecked"] else "",
        )

    @classmethod
    def _gate_item(cls, item: dict[str, Any]) -> str | None:
        folder_match = str(item.get("folder_match_status") or "").strip()
        if folder_match != "Matched":
            return "folder_mismatch"

        raw_model_id = str(item.get("model_id") or "").strip()
        sku = Product.normalize_sku(raw_model_id)
        if sku is None or not PRODUCT_SKU_REGEX.fullmatch(sku):
            return "invalid_model_id"

        exports = item.get("exports") or {}
        if not cls._exports_packageable(exports) and not cls._package_formats_packageable(
            cls.normalize_package_formats(item.get("package_formats"))
        ):
            return "exports_incomplete"

        name = str(item.get("name") or "").strip()
        if len(name) < 2:
            return "invalid_name"

        for export_key in ("glb", "fbx", "obj", "gltf", "max"):
            status = str(exports.get(export_key) or "").strip()
            size_key = f"{export_key}_size"
            if status == _EXPORT_SUCCESS and size_key in exports:
                size_val = exports.get(size_key)
                if size_val is not None and Decimal(str(size_val)) <= 0:
                    return "invalid_export_size"

        price = item.get("price")
        if price is None or price == "":
            return "invalid_price"
        try:
            price_dec = price if isinstance(price, Decimal) else Decimal(str(price))
        except Exception:
            return "invalid_price"
        if price_dec < Decimal("0"):
            return "invalid_price"

        from config.currency import normalize_currency, to_minor_units

        currency_raw = item.get("currency")
        if currency_raw is None or str(currency_raw).strip() == "":
            currency = "USD"
        else:
            currency = str(currency_raw).strip().upper()
        try:
            normalize_currency(currency)
        except ValueError:
            return 'invalid_currency'
        try:
            to_minor_units(price_dec, currency)
        except ValueError:
            return 'invalid_price'

        media = item.get("media") or {}
        thumbnail_key = str(media.get("thumbnail_key") or "").strip()
        if not thumbnail_key:
            return "missing_thumbnail"

        qa_status = str(item.get("qa_status") or "").strip()
        if qa_status not in _QA_READY:
            return "qa_not_ready"

        checksum = str(item.get("glb_checksum") or "").strip()
        if not checksum or not _GLB_CHECKSUM_RE.fullmatch(checksum):
            return "missing_glb_checksum"

        r2_prefix = str(item.get("r2_key_prefix") or "").strip()
        if r2_prefix not in (f"models/{sku}/", f"{FREE_MODELS_PREFIX}{sku}/"):
            return "invalid_r2_prefix"

        preview_key = str(media.get("preview_key") or "").strip()
        if not preview_key:
            return "missing_preview"

        package_size = media.get("package_file_size")
        if package_size is not None and int(package_size) <= 0:
            return "invalid_export_size"

        return None

    @staticmethod
    def _exports_packageable(exports: dict[str, Any]) -> bool:
        """Bridge rule: a GLB preview plus at least one FBX, OBJ or MAX export."""
        if str(exports.get("glb") or "").strip() != _EXPORT_SUCCESS:
            return False
        return any(
            str(exports.get(key) or "").strip() == _EXPORT_SUCCESS
            for key in _PACKAGEABLE_EXPORTS
        )

    @staticmethod
    def _package_formats_packageable(package_formats: list[str]) -> bool:
        """3ds Max plugin rule: the package holds a model format other than GLB/glTF."""
        return any(fmt not in _PREVIEW_ONLY_FORMATS for fmt in package_formats)

    @staticmethod
    def normalize_package_formats(raw: Any) -> list[str]:
        """Lowercase extensions without the dot, de-duplicated and sorted."""
        if not isinstance(raw, (list, tuple)):
            return []
        formats = {str(value or "").strip().lower().lstrip(".") for value in raw}
        return sorted(fmt for fmt in formats if fmt)

    @classmethod
    def resolve_category(
        cls,
        category_name: str,
        subcategory_name: str = "",
        *,
        warnings: list[str] | None = None,
    ) -> Category | None:
        parent_name = category_name.strip()
        if not parent_name:
            return None

        parent = (
            Category.objects.filter(name__iexact=parent_name, is_active=True)
            .order_by("name")
            .first()
        )
        if parent is None:
            return None

        child_name = subcategory_name.strip()
        if not child_name:
            return parent

        child = (
            Category.objects.filter(
                name__iexact=child_name,
                parent=parent,
                is_active=True,
            )
            .order_by("name")
            .first()
        )
        if child is None:
            # Keep the parent fallback, but tell the uploader the subcategory is missing.
            if warnings is not None:
                warnings.append("subcategory_not_found")
            return parent
        return child

    @classmethod
    def _normalize_object_key(cls, raw_key: str, *, sku: str, prefix: str = "") -> str:
        relative = media_relative_path(raw_key.strip())
        if relative is None:
            raise ProductError("invalid_object_key", field="object_key")
        expected_prefix = prefix or f"models/{sku}/"
        if not relative.startswith(expected_prefix):
            raise ProductError("invalid_object_key", field="object_key")
        if relative.endswith("/") or relative == expected_prefix.rstrip("/"):
            raise ProductError("invalid_object_key", field="object_key")
        return relative

    @classmethod
    def _build_media_pointers(
        cls,
        sku: str,
        media: dict[str, Any],
        *,
        prefix: str = "",
    ) -> dict[str, Any]:
        prefix = prefix or f"models/{sku}/"
        thumbnail_key = cls._normalize_object_key(
            str(media.get("thumbnail_key") or ""),
            sku=sku,
            prefix=prefix,
        )
        preview_key = cls._normalize_object_key(
            str(media.get("preview_key") or ""),
            sku=sku,
            prefix=prefix,
        )
        if _is_zip_key(thumbnail_key) or _is_zip_key(preview_key):
            raise ProductError("invalid_object_key", field="object_key")

        package_key_raw = str(media.get("package_key") or "").strip()
        package_key: str | None = None
        if package_key_raw:
            package_key = cls._normalize_object_key(package_key_raw, sku=sku, prefix=prefix)
            # Only these two names are packages; a paid model's .zip is always private.
            if package_key not in (f"{prefix}package.zip", f"{prefix}{sku}.zip"):
                raise ProductError("invalid_object_key", field="package_key")

        gallery_keys: list[str] = []
        for raw in media.get("gallery_keys") or []:
            key = cls._normalize_object_key(str(raw or ""), sku=sku, prefix=prefix)
            if _is_zip_key(key):
                raise ProductError("invalid_object_key", field="object_key")
            gallery_keys.append(key)
        gallery_urls = [build_public_media_url(key) for key in gallery_keys]

        # The buyer's download is named after the package key unless the batch says otherwise.
        default_file_name = package_key.rsplit("/", 1)[-1] if package_key else "package.zip"

        return {
            "thumbnail_key": thumbnail_key,
            "thumbnail_url": build_public_media_url(thumbnail_key),
            "preview_key": preview_key,
            "preview_url": build_public_media_url(preview_key),
            "package_key": package_key,
            "package_file_name": str(media.get("package_file_name") or "").strip()
            or default_file_name,
            "package_file_format": str(media.get("package_file_format") or "zip").strip().lower()
            or "zip",
            "package_file_size": int(media.get("package_file_size") or 0),
            "gallery_keys": gallery_keys,
            "gallery_urls": gallery_urls,
            "has_thumbnail": True,
            "has_preview": True,
            "has_package": package_key is not None,
        }

    @classmethod
    def _check_preview(
        cls,
        sku: str,
        item: dict[str, Any],
        media_pointers: dict[str, Any],
        existing: Product | None,
    ) -> dict[str, Any]:
        """Check the pipeline's preview where it is; the product points straight at it.

        The import never copies, renames or deletes the uploader's files. A rejected
        preview stays in place for the uploader's report, and its next upload replaces it.
        The one exception is a file the virus scanner reports as malware.
        """
        source_key = media_pointers["preview_key"]
        # preview_not_scanned: None when the product keeps its current preview (unknown).
        pointers = {**media_pointers, "preview_unchecked": False, "preview_not_scanned": False}
        if not source_key.lower().endswith(".glb"):
            raise ProductError("invalid_preview_format", field="preview_key")

        storage = get_public_storage()
        try:
            source_exists = storage.exists(source_key)
        except _STORAGE_ERRORS:
            logger.exception("catalog_import_preview_unreadable model_id=%s", sku)
            raise ProductError("preview_unreadable", field="preview_key") from None

        if not source_exists:
            # A re-import may skip the upload and keep the preview the product already has.
            if (
                existing is not None
                and existing.preview_model
                and existing.preview_triangle_count is not None
            ):
                pointers["preview_key"] = media_relative_path(existing.preview_model)
                pointers["preview_url"] = existing.preview_model
                pointers["preview_triangle_count"] = existing.preview_triangle_count
                pointers["preview_not_scanned"] = None
                return pointers
            raise ProductError("missing_preview_object", field="preview_key")

        try:
            if storage.size(source_key) > PRODUCT_PREVIEW_MAX_BYTES:
                raise ProductError("preview_too_large", field="preview_key")
            with storage.open(source_key, "rb") as handle:
                data = handle.read()
        except _STORAGE_ERRORS:
            logger.exception("catalog_import_preview_unreadable model_id=%s", sku)
            raise ProductError("preview_unreadable", field="preview_key") from None

        # A configured scanner is always used. Without one, CATALOG_IMPORT_SCAN_REQUIRED=False
        # lets the studio's own uploads in unscanned; the structure checks still run.
        skip_scan = not settings.CATALOG_IMPORT_SCAN_REQUIRED and not settings.PACKAGE_SCAN_HOST
        try:
            triangles = inspect_product_content(
                ContentFile(data, name="preview.glb"), ".glb", scan=not skip_scan
            )
        except ValidationError as exc:
            scan_code = scan_error_code(exc)
            if scan_code == SCAN_MALWARE_FOUND:
                logger.warning("catalog_import_preview_malware model_id=%s key=%s", sku, source_key)
                cls._delete_public_object(source_key)
                raise ProductError("preview_malware", field="preview_key") from None
            if scan_code == SCAN_UNAVAILABLE:
                logger.error("catalog_import_scanner_unavailable model_id=%s", sku)
                raise ProductError("scanner_unavailable", field="preview_key") from None
            raise ProductError("invalid_preview", field="preview_key") from None
        if skip_scan:
            logger.warning("catalog_import_preview_not_scanned model_id=%s", sku)
            pointers["preview_not_scanned"] = True

        polygon_count = item.get("polygon_count")
        if preview_reduction_error(triangles, int(polygon_count) if polygon_count else None):
            raise ProductError("preview_not_reduced", field="preview_key")
        if not triangles or not polygon_count:
            # The reduction rule needs both numbers. Without them the preview is accepted
            # as it is, so a full-detail model could become public: say so.
            pointers["preview_unchecked"] = True
            logger.warning(
                "catalog_import_preview_unchecked model_id=%s triangles=%s polygon_count=%s",
                sku,
                triangles,
                polygon_count,
            )

        pointers.update(
            preview_url=_versioned_url(source_key, data),
            preview_triangle_count=triangles,
        )
        return pointers

    @classmethod
    def _check_images(
        cls,
        sku: str,
        media_pointers: dict[str, Any],
        existing: Product | None,
    ) -> dict[str, Any]:
        """Check the pipeline's thumbnail and gallery images where they are.

        The product points at the original files. An image that is not in storage skips
        the row, so a product never goes in with a broken image. A re-import may leave the
        thumbnail out and keep the one the product already has.
        """
        thumbnail_key = media_pointers["thumbnail_key"]
        try:
            thumbnail_url = cls._check_image(
                thumbnail_key,
                reason="invalid_thumbnail",
                missing="missing_thumbnail_object",
            )
        except ProductError as exc:
            kept = media_relative_path(existing.thumbnail) if existing is not None else None
            if exc.message != "missing_thumbnail_object" or not kept:
                raise
            thumbnail_key, thumbnail_url = kept, existing.thumbnail

        replace_gallery = cls._gallery_is_replaceable(sku, existing)
        pointers = {
            **media_pointers,
            "thumbnail_key": thumbnail_key,
            "thumbnail_url": thumbnail_url,
            "replace_gallery": replace_gallery,
        }
        # Don't read images the import won't use.
        if replace_gallery:
            pointers["gallery_urls"] = [
                cls._check_image(
                    key, reason="invalid_gallery_image", missing="missing_gallery_object"
                )
                for key in media_pointers["gallery_keys"]
            ]
        return pointers

    @staticmethod
    def _check_image(key: str, *, reason: str, missing: str) -> str:
        """The image's public URL, after checking it is a usable image. Saves nothing."""
        storage = get_public_storage()
        try:
            if not storage.exists(key):
                raise ProductError(missing, field="media")
            if storage.size(key) > _IMPORT_IMAGE_MAX_BYTES:
                raise ProductError(reason, field="media")
            with storage.open(key, "rb") as handle:
                data = handle.read()
        except _STORAGE_ERRORS:
            logger.exception("catalog_import_image_unreadable key=%s", key)
            raise ProductError("image_unreadable", field="media") from None

        try:
            validate_image_bytes(data)
        except ValidationError:
            raise ProductError(reason, field="media") from None
        return _versioned_url(key, data)

    @staticmethod
    def _gallery_is_replaceable(sku: str, existing: Product | None) -> bool:
        """True when the gallery is empty or every image came from an earlier import.

        A re-import must not touch gallery images an administrator uploaded.
        """
        if existing is None:
            return True
        urls = ProductImage.objects.filter(product=existing).values_list("image_url", flat=True)
        prefix = f"models/{sku}/"
        return all((media_relative_path(url) or "").startswith(prefix) for url in urls)

    @staticmethod
    def _import_copies(sku: str, existing: Product | None) -> list[str]:
        """Keys of the preview and WebP copies earlier imports made for this product."""
        if existing is None:
            return []
        urls = [
            existing.thumbnail,
            existing.preview_model,
            *ProductImage.objects.filter(product=existing).values_list("image_url", flat=True),
        ]
        keys = {media_relative_path(url or "") for url in urls}
        return sorted(key for key in keys if key and is_import_copy_key(key, sku=sku))

    @classmethod
    def _delete_unreferenced_copies(cls, keys: list[str]) -> None:
        """Remove old import copies once no product or gallery image points at them."""
        for key in keys:
            if (
                Product.objects.filter(
                    Q(thumbnail__contains=key) | Q(preview_model__contains=key)
                ).exists()
                or ProductImage.objects.filter(image_url__contains=key).exists()
            ):
                continue
            cls._delete_public_object(key)

    @staticmethod
    def _delete_public_object(key: str) -> None:
        try:
            get_public_storage().delete(key)
        except _STORAGE_ERRORS:
            logger.exception("catalog_import_object_delete_failed key=%s", key)

    @classmethod
    def _create_product(
        cls,
        item: dict[str, Any],
        *,
        sku: str,
        category: Category,
        import_batch_id: str,
        import_source: str,
        media_pointers: dict[str, Any],
    ) -> Product:
        price = item["price"]
        if not isinstance(price, Decimal):
            price = Decimal(str(price))
        discount = item.get("discount_price")
        if discount is not None and discount != "":
            if not isinstance(discount, Decimal):
                discount = Decimal(str(discount))
        else:
            discount = None

        currency = str(item.get("currency") or "USD").strip().upper() or "USD"
        license_type = str(item.get("license_type") or Product.LicenseType.STANDARD).strip()
        if license_type not in {c.value for c in Product.LicenseType}:
            license_type = Product.LicenseType.STANDARD

        short_description = str(item.get("short_description") or "")[:500]
        polygon_count = item.get("polygon_count")
        if polygon_count is not None:
            polygon_count = int(polygon_count)

        return ProductService.create_product(
            ProductCreateData(
                category_id=category.pk,
                name=str(item.get("name") or "").strip(),
                price=price,
                description=str(item.get("description") or ""),
                short_description=short_description,
                currency=currency,
                discount_price=discount,
                thumbnail=media_pointers["thumbnail_url"],
                preview_model=media_pointers["preview_url"],
                polygon_count=polygon_count,
                software_used=str(item.get("software_used") or ""),
                animated=bool(item.get("animated", False)),
                rigged=bool(item.get("rigged", False)),
                pbr_ready=bool(item.get("pbr_ready", False)),
                game_ready=bool(item.get("game_ready", False)),
                license_type=license_type,
                status=Product.Status.PENDING_REVIEW,
                sku=sku,
                import_batch_id=import_batch_id,
                import_source=import_source,
                glb_checksum=str(item.get("glb_checksum") or "").strip().lower(),
                has_thumbnail=media_pointers["has_thumbnail"],
                has_preview=media_pointers["has_preview"],
                has_package=media_pointers["has_package"],
                package_formats=cls.normalize_package_formats(item.get("package_formats")),
            )
        )

    @classmethod
    def _update_product(
        cls,
        product: Product,
        item: dict[str, Any],
        *,
        sku: str,
        category: Category,
        import_batch_id: str,
        import_source: str,
        media_pointers: dict[str, Any],
    ) -> Product:
        price = item["price"]
        if not isinstance(price, Decimal):
            price = Decimal(str(price))
        discount = item.get("discount_price")
        clear_discount = discount is None or discount == ""
        discount_value: Decimal | None = None
        if not clear_discount:
            discount_value = (
                discount if isinstance(discount, Decimal) else Decimal(str(discount))
            )

        currency = str(item.get("currency") or "USD").strip().upper() or "USD"
        license_type = str(item.get("license_type") or Product.LicenseType.STANDARD).strip()
        if license_type not in {c.value for c in Product.LicenseType}:
            license_type = Product.LicenseType.STANDARD

        short_description = str(item.get("short_description") or "")[:500]
        polygon_count = item.get("polygon_count")
        clear_polygon = polygon_count is None
        polygon_value: int | None = None if clear_polygon else int(polygon_count)

        return ProductService.update_product(
            product,
            ProductUpdateData(
                category_id=category.pk,
                name=str(item.get("name") or "").strip(),
                description=str(item.get("description") or ""),
                short_description=short_description,
                price=price,
                currency=currency,
                discount_price=discount_value,
                clear_discount_price=clear_discount,
                thumbnail=media_pointers["thumbnail_url"],
                preview_model=media_pointers["preview_url"],
                polygon_count=polygon_value,
                clear_polygon_count=clear_polygon,
                software_used=str(item.get("software_used") or ""),
                animated=bool(item.get("animated", False)),
                rigged=bool(item.get("rigged", False)),
                pbr_ready=bool(item.get("pbr_ready", False)),
                game_ready=bool(item.get("game_ready", False)),
                license_type=license_type,
                status=Product.Status.PENDING_REVIEW,
                sku=sku,
                import_batch_id=import_batch_id,
                import_source=import_source,
                glb_checksum=str(item.get("glb_checksum") or "").strip().lower(),
                has_thumbnail=media_pointers["has_thumbnail"],
                has_preview=media_pointers["has_preview"],
                has_package=media_pointers["has_package"],
                package_formats=cls.normalize_package_formats(item.get("package_formats")),
            ),
        )

    @classmethod
    def _sync_gallery(cls, product: Product, gallery_urls: list[str], *, replace: bool) -> None:
        # A re-import must not delete gallery images an administrator uploaded: the
        # gallery is only replaced when it is empty or every image came from an import.
        if not gallery_urls or not replace:
            return
        ProductImage.objects.filter(product=product).delete()
        ProductImage.objects.bulk_create(
            [
                ProductImage(
                    product=product,
                    image_url=url,
                    display_order=index,
                    is_primary=index == 0,
                )
                for index, url in enumerate(gallery_urls)
            ]
        )

    @staticmethod
    def _sync_scan_note(product: Product, not_scanned: bool | None) -> None:
        """Tell reviewers (QA notes in /console) when the preview went in unscanned."""
        if not_scanned is None:  # the product kept its current preview
            return
        notes = product.qa_notes or ""
        if not_scanned and PREVIEW_NOT_SCANNED_NOTE not in notes:
            notes = f"{notes}\n{PREVIEW_NOT_SCANNED_NOTE}".strip()
        elif not not_scanned and PREVIEW_NOT_SCANNED_NOTE in notes:
            notes = notes.replace(PREVIEW_NOT_SCANNED_NOTE, "").strip()
        else:
            return
        product.qa_notes = notes
        product.save(update_fields=["qa_notes", "updated_at"])

    @classmethod
    def _sync_package(cls, product: Product, media_pointers: dict[str, Any]) -> None:
        package_key = media_pointers.get("package_key")
        # Without a new package in the batch, keep the package already on the product.
        if not package_key:
            return
        ProductFile.objects.filter(product=product, is_preview=False).delete()
        ProductFile.objects.create(
            product=product,
            file_name=media_pointers["package_file_name"][:255],
            file_format=media_pointers["package_file_format"][:32],
            file_size=max(0, int(media_pointers["package_file_size"] or 0)),
            storage_path=package_key,
            version="1.0",
            is_preview=False,
        )


def _is_zip_key(key: str) -> bool:
    return key.lower().endswith(".zip")


def _versioned_url(key: str, data: bytes) -> str:
    """Public URL with a content hash, so a re-uploaded file is never served stale."""
    return f"{build_public_media_url(key)}?v={hashlib.sha256(data).hexdigest()[:12]}"


def is_import_copy_key(key: str, *, sku: str | None = None) -> bool:
    """A copy earlier imports made: a random preview or a WebP copy of an image.

    Never matches the uploader's own files (preview_<ID>.glb, previewthumb_<ID>.*,
    render_<ID>_NN.*), which the import must leave alone.
    """
    match = _IMPORT_COPY_KEY_RE.fullmatch(key)
    return match is not None and (sku is None or match.group("sku") == sku)
