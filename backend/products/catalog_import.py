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
from django.db import IntegrityError, transaction
from django.db.models import Q

from accounts.security_log import log_admin_action
from categories.models import CATEGORY_CODE_REGEX, Category
from config.media import (
    FREE_MODELS_PREFIX,
    SPIN_FRAME_COUNT,
    SPIN_PUBLIC_PREFIX,
    media_relative_path,
    package_object_exists,
)
from config.storages import build_public_media_url, get_public_storage
from config.upload_security import (
    SCAN_MALWARE_FOUND,
    SCAN_UNAVAILABLE,
    inspect_product_content,
    scan_error_code,
)
from orders.entitlements import bought_package_kinds
from products.edge_colour import edge_fields, fetch_side_colours
from products.models import (
    PRODUCT_SKU_REGEX,
    Product,
    ProductFile,
    ProductImage,
    ProductPriceChange,
)
from products.packages import PACKAGE_KINDS, sync_summary_price
from products.price_history import PriceState, record_price_change
from products.services import (
    UPLOAD_KIND_FREE,
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
# The Model ID Tool ends descriptions with its folder list ("Folders in model folder:
# - BLENDER_FILE - FBX ..."). It describes the pipeline's folders, not the model.
_FOLDER_LISTING_RE = re.compile(r"\s*Folders in model folder\s*:.*\Z", re.IGNORECASE | re.DOTALL)
# Row warning: a re-upload kept the text an administrator owns (see _update_product).
CONSOLE_TEXT_KEPT = "console_text_kept"
# Row warning: a model moved from free-models/ to models/ and still costs 0; it gets its
# price on the Pricing page after QA.
PRICE_NEEDED = "price_needed"
# Row warnings about the category, which comes from the code in the Model ID (ELE-000001):
# the sheet's category name gave a category its code, or a new category waits for approval.
CATEGORY_LINKED = "category_linked"
CATEGORY_PENDING_APPROVAL = "category_pending_approval"
# Row warning: a live model got a new package; it is not sold until it has a price.
PACKAGE_NEEDS_PRICE = "package_needs_price"
_CATEGORY_CODE_RE = re.compile(CATEGORY_CODE_REGEX)


class _RowRefused(Exception):
    """A row the import skips, raised inside its transaction so nothing it wrote is kept."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason
# Row warning: the model is live; it stays on sale and waits in the QA queue as an update.
LIVE_UPDATE_IN_QA = "live_update_in_qa"
# Row warning: a live free model was uploaded as paid; it left the store and goes through QA
# and the Pricing page again (its zip is now private, so it cannot stay a free download).
FREE_TO_PAID_OFF_SALE = "free_to_paid_off_sale"
# QA note on a live model whose re-upload the website refused. The uploader replaces the
# files in R2 before it calls the import, so the store may already serve the new files.
_REFUSED_NOTE_PREFIX = "Re-upload "


def strip_folder_listing(text: str) -> str:
    """Drop the pipeline's trailing "Folders in model folder: ..." list from a description."""
    return _FOLDER_LISTING_RE.sub("", text or "").strip()


def _without_refusal_notes(notes: str) -> str:
    return "\n".join(
        line for line in (notes or "").splitlines() if not line.startswith(_REFUSED_NOTE_PREFIX)
    ).strip()
# A re-upload sends these back to QA. An archived model (deleted while it had orders)
# returns too: uploading it again means it should be sold again. A model waiting for its
# price is not on sale yet, so its new files need a new QA check. A published model is not
# in this set: it stays on sale and its update waits in the QA queue (`pending_update`).
_UPSERTABLE_STATUSES = frozenset(
    {
        Product.Status.DRAFT,
        Product.Status.PENDING_REVIEW,
        Product.Status.AWAITING_PRICE,
        Product.Status.REJECTED,
        Product.Status.ARCHIVED,
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
    # Every warning for the row, including `warning`.
    warnings: tuple[str, ...] = ()
    # The sheet's name, for the audit log (not in the response).
    name: str = ""

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
        metadata: dict[str, Any] = {}
        if self.not_scanned_model_ids:
            metadata.update(preview_not_scanned=True, not_scanned_model_ids=self.not_scanned_model_ids)
        # Why each model did not reach QA, so the admin can see it without the uploader's log.
        refused = [row for row in self.results if row.action in ("skipped", "failed")]
        if refused:
            metadata["skipped_reasons"] = {row.model_id: row.reason for row in refused}
            metadata["refused_names"] = {row.model_id: row.name for row in refused}
        return metadata

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
                actor_id=actor_id,
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
        actor_id: str,
    ) -> CatalogImportRowResult:
        warnings: list[str] = []
        row = cls._import_item(
            item,
            import_batch_id=import_batch_id,
            import_source=import_source,
            actor_id=actor_id,
            warnings=warnings,
        )
        if row.action in ("skipped", "failed") and cls._flag_refused_live_update(
            row, import_batch_id=import_batch_id
        ):
            warnings.append(LIVE_UPDATE_IN_QA)
        # `warnings` lists every warning; `warning` keeps its single value for older callers.
        if row.warning:
            warnings.append(row.warning)
        return replace(row, warnings=tuple(warnings), name=str(item.get("name") or "").strip()[:255])

    @classmethod
    def _import_item(
        cls,
        item: dict[str, Any],
        *,
        import_batch_id: str,
        import_source: str,
        actor_id: str,
        warnings: list[str],
    ) -> CatalogImportRowResult:
        # models/<sku>/ is a paid model (zips in the private bucket); free-models/<sku>/ is
        # a free one with every file, zips included, in the public bucket.
        prefix = str(item.get("r2_key_prefix") or "").strip()
        free_upload = prefix.startswith(FREE_MODELS_PREFIX)

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

        try:
            existing = ProductService.get_by_sku(sku)
        except ProductError:
            existing = None

        # A live model uploaded again stays on sale with its new files (the uploader has
        # already replaced them in R2) and waits in the QA queue as an update.
        live_update = existing is not None and existing.status == Product.Status.PUBLISHED
        # A live free model (zips under free-models/) uploaded again as paid: its zips move to
        # the private bucket, and as a free download it would hand them to anyone. It leaves
        # the store and goes through QA and the Pricing page like a new paid model.
        free_to_paid = (
            live_update
            and not free_upload
            and ProductService.upload_kind(existing) == UPLOAD_KIND_FREE
        )
        if free_to_paid:
            live_update = False
        if existing is not None:
            if (
                not live_update
                and not free_to_paid
                and existing.status not in _UPSERTABLE_STATUSES
            ):
                return CatalogImportRowResult(
                    model_id=sku,
                    action="skipped",
                    reason="published_sku",
                )
        # The administrator owns an existing model's category, like its text, so a re-upload
        # never looks the category up; a new model's category is resolved in its transaction.

        media = item.get("media") or {}
        try:
            media_pointers = cls._build_media_pointers(sku, media, prefix=prefix)
        except ProductError as exc:
            return CatalogImportRowResult(
                model_id=sku,
                action="skipped",
                reason=exc.message if exc.field == "object_key" else "invalid_object_key",
            )

        # Every zip must be there: catch a typo or failed upload now rather than at approval.
        if not all(package_object_exists(entry["key"]) for entry in media_pointers["packages"]):
            return CatalogImportRowResult(
                model_id=sku,
                action="skipped",
                reason="missing_package_object",
            )
        # Buyers keep their files: a package someone bought cannot be dropped by a re-upload.
        if existing is not None and cls._drops_bought_package(existing, media_pointers["packages"]):
            return CatalogImportRowResult(
                model_id=sku,
                action="skipped",
                reason="package_has_buyers",
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
        # Worked out before the update, which leaves the administrator's text as it is.
        text_kept = existing is not None and cls._sheet_text_differs(existing, item)
        # A model moved from free-models/ to models/: its packages need prices.
        moved_from_free = (
            existing is not None
            and not free_upload
            and ProductService.upload_kind(existing) == UPLOAD_KIND_FREE
        )

        category_notes: list[str] = []
        try:
            with transaction.atomic():
                if existing is None:
                    category = cls.resolve_category(
                        sku,
                        str(item.get("category") or ""),
                        import_batch_id=import_batch_id,
                        actor_id=actor_id,
                        notes=category_notes,
                    )
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
                        import_batch_id=import_batch_id,
                        import_source=import_source,
                        media_pointers=media_pointers,
                        live_update=live_update,
                    )
                    action = "updated"
                cls._sync_review_flags(product, live_update=live_update)
                if product.preview_triangle_count != media_pointers["preview_triangle_count"]:
                    product.preview_triangle_count = media_pointers["preview_triangle_count"]
                    product.save(update_fields=["preview_triangle_count", "updated_at"])
                cls._sync_gallery(
                    product,
                    media_pointers["gallery_urls"],
                    replace=media_pointers["replace_gallery"],
                )
                new_kinds = cls._sync_packages(
                    product, media_pointers["packages"], free_upload=free_upload
                )
                cls._sync_scan_note(product, media_pointers["preview_not_scanned"])
        except _RowRefused as exc:
            return CatalogImportRowResult(model_id=sku, action="skipped", reason=exc.reason)
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
        warnings.extend(category_notes)
        if media_pointers["preview_not_scanned"]:
            warnings.append("preview_not_scanned")
        if text_kept:
            warnings.append(CONSOLE_TEXT_KEPT)
        if live_update:
            warnings.append(LIVE_UPDATE_IN_QA)
        if live_update and new_kinds and not free_upload:
            warnings.append(PACKAGE_NEEDS_PRICE)
        if moved_from_free:
            warnings.append(PRICE_NEEDED)
        if free_to_paid:
            warnings.append(FREE_TO_PAID_OFF_SALE)

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

        from config.currency import normalize_currency

        # The price is never read from the sheet: packages are priced on the Pricing page.
        currency_raw = item.get("currency")
        if currency_raw is None or str(currency_raw).strip() == "":
            currency = "USD"
        else:
            currency = str(currency_raw).strip().upper()
        try:
            normalize_currency(currency)
        except ValueError:
            return "invalid_currency"

        media = item.get("media") or {}
        thumbnail_key = str(media.get("thumbnail_key") or "").strip()
        if not thumbnail_key:
            return "missing_thumbnail"

        qa_status = str(item.get("qa_status") or "").strip()
        if qa_status not in _QA_READY:
            return "qa_not_ready"

        r2_prefix = str(item.get("r2_key_prefix") or "").strip()
        if r2_prefix not in (f"models/{sku}/", f"{FREE_MODELS_PREFIX}{sku}/"):
            return "invalid_r2_prefix"

        # A model shows a 3D preview, a 360° spin, or both; the checksum goes with the preview.
        if str(media.get("preview_key") or "").strip():
            checksum = str(item.get("glb_checksum") or "").strip()
            if not _GLB_CHECKSUM_RE.fullmatch(checksum):
                return "missing_glb_checksum"
        elif len(media.get("spin_keys") or ()) != SPIN_FRAME_COUNT:
            return "missing_preview"

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
        sku: str,
        sheet_name: str,
        *,
        import_batch_id: str,
        actor_id: str,
        notes: list[str],
    ) -> Category:
        """A new model's category, found by the code in its Model ID (ELE in ELE-000001).

        The code belongs to one category for good. The sheet's name only links a category
        that has no code yet (once), or names a new category, which is created hidden and
        waiting for approval. Raises _RowRefused with the reason otherwise. Runs inside the
        row's transaction, so a refused row keeps no link and no new category.
        """
        code = sku.split("-", 1)[0]
        if not _CATEGORY_CODE_RE.fullmatch(code):
            raise _RowRefused("invalid_model_id")
        by_code = Category.objects.select_for_update().filter(code=code).first()
        if by_code is not None:
            return cls._usable_category(by_code, notes)

        name = " ".join(sheet_name.split())
        if not name or len(name) > 255:
            raise _RowRefused("category_unmapped")
        named = list(Category.objects.select_for_update().filter(name__iexact=name))
        if not named:
            return cls._create_pending_category(
                name, code, import_batch_id=import_batch_id, actor_id=actor_id, notes=notes
            )
        unlinked = [category for category in named if category.is_active and category.code is None]
        if len(unlinked) > 1:
            raise _RowRefused("category_ambiguous")
        if unlinked:
            return cls._link_code(unlinked[0], code, notes)
        if any(category.code for category in named):
            raise _RowRefused("category_code_mismatch")
        # Only switched-off categories have this name: never revive one silently.
        raise _RowRefused("category_inactive")

    @staticmethod
    def _usable_category(category: Category, notes: list[str]) -> Category:
        if category.is_active:
            return category
        if not category.pending_approval:
            raise _RowRefused("category_inactive")
        if category.rejected_at is not None:
            raise _RowRefused("category_rejected")
        notes.append(CATEGORY_PENDING_APPROVAL)
        return category

    @classmethod
    def _link_code(cls, category: Category, code: str, notes: list[str]) -> Category:
        """Give a category without a code this ID's code, once; later models find it by code."""
        try:
            with transaction.atomic():
                category.code = code
                category.save(update_fields=["code", "updated_at"])
        except IntegrityError:
            # Another import linked the code first.
            return cls._usable_category(Category.objects.get(code=code), notes)
        notes.append(CATEGORY_LINKED)
        return category

    @classmethod
    def _create_pending_category(
        cls,
        name: str,
        code: str,
        *,
        import_batch_id: str,
        actor_id: str,
        notes: list[str],
    ) -> Category:
        """The first model of a new code creates its category: hidden until an admin approves."""
        try:
            with transaction.atomic():
                category = Category.objects.create(
                    name=name,
                    slug=Category.build_slug(name),
                    code=code,
                    is_active=False,
                    pending_approval=True,
                    created_by_import=True,
                    created_from_batch=import_batch_id[:128],
                )
        except IntegrityError:
            # Another import created the category for this code first.
            return cls._usable_category(Category.objects.get(code=code), notes)
        log_admin_action(
            action="category_import_create",
            actor_id=actor_id,
            target_id=str(category.pk),
            metadata={"code": code, "name": name, "import_batch_id": import_batch_id},
        )
        notes.append(CATEGORY_PENDING_APPROVAL)
        return category

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
        # No preview is fine when the model has a 360° spin (checked by the gate).
        raw_preview_key = str(media.get("preview_key") or "").strip()
        preview_key = (
            cls._normalize_object_key(raw_preview_key, sku=sku, prefix=prefix)
            if raw_preview_key
            else ""
        )
        if _is_zip_key(thumbnail_key) or _is_zip_key(preview_key):
            raise ProductError("invalid_object_key", field="object_key")

        gallery_keys: list[str] = []
        for raw in media.get("gallery_keys") or []:
            key = cls._normalize_object_key(str(raw or ""), sku=sku, prefix=prefix)
            if _is_zip_key(key):
                raise ProductError("invalid_object_key", field="object_key")
            gallery_keys.append(key)
        gallery_urls = [build_public_media_url(key) for key in gallery_keys]
        spin_keys = cls._spin_keys(sku, media.get("spin_keys"))

        return {
            "thumbnail_key": thumbnail_key,
            "thumbnail_url": build_public_media_url(thumbnail_key),
            "preview_key": preview_key,
            "preview_url": build_public_media_url(preview_key) if preview_key else "",
            "packages": cls._package_entries(sku, media, prefix=prefix),
            "gallery_keys": gallery_keys,
            "gallery_urls": gallery_urls,
            # None: keep the product's spin (older plugin); []: clear it; else the 36 frames.
            "spin_keys": spin_keys,
            "spin_urls": None
            if spin_keys is None
            else [build_public_media_url(key) for key in spin_keys],
            "has_thumbnail": True,
            "has_preview": bool(preview_key),
            "has_package": True,
        }

    @staticmethod
    def _package_entries(sku: str, media: dict[str, Any], *, prefix: str) -> list[dict[str, Any]]:
        """The zips the tool made, one per package kind, checked against the one name each may
        have: ``{prefix}{sku}_{kind}.zip``. ``media.package_key`` (the main zip) must be one
        of them. Any other list is refused with ``invalid_packages``."""
        entries: list[dict[str, Any]] = []
        for raw in media.get("packages") or ():
            kind = str(raw.get("kind") or "").strip()
            key = media_relative_path(str(raw.get("key") or "").strip())
            size = raw.get("file_size")
            if (
                kind not in PACKAGE_KINDS
                or any(entry["kind"] == kind for entry in entries)
                or key != f"{prefix}{sku}_{kind}.zip"
                or not isinstance(size, int)
                or size <= 0
                or str(raw.get("file_format") or "").strip().lower() != "zip"
            ):
                raise ProductError("invalid_packages", field="object_key")
            entries.append(
                {
                    "kind": kind,
                    "key": key,
                    "file_name": str(raw.get("file_name") or "").strip()[:255]
                    or key.rsplit("/", 1)[-1],
                    "file_size": size,
                }
            )
        main_key = media_relative_path(str(media.get("package_key") or "").strip())
        if not entries or main_key not in {entry["key"] for entry in entries}:
            raise ProductError("invalid_packages", field="object_key")
        return entries

    @staticmethod
    def _spin_keys(sku: str, raw: Any) -> list[str] | None:
        """The 360° frame keys, checked against the one name and order they may have.

        The frames are always under 360/<sku>/, for paid and free models alike, so the
        row's r2_key_prefix is not used. None (absent) keeps the product's spin and []
        clears it; any other value must be exactly the 36 frames in order.
        """
        if raw is None:
            return None
        if not isinstance(raw, (list, tuple)):
            raise ProductError("invalid_spin_keys", field="object_key")
        if not raw:
            return []
        expected = spin_frame_keys(sku)
        keys = [media_relative_path(str(key or "").strip()) for key in raw]
        if keys != expected:
            raise ProductError("invalid_spin_keys", field="object_key")
        return expected

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
        if not source_key:
            # No preview sent (a model with a 360° spin): a re-upload keeps the preview it has.
            kept = existing.preview_model if existing is not None else ""
            pointers.update(
                preview_url=kept,
                preview_triangle_count=existing.preview_triangle_count if kept else None,
                preview_not_scanned=None,
                has_preview=bool(kept),
            )
            return pointers
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
        # The 360° frames: every one must be a real image, so a spin is never broken.
        replace_spin = media_pointers["spin_keys"] is not None and cls._spin_is_replaceable(
            sku, existing
        )
        if not replace_spin:
            pointers["spin_urls"] = None
        elif media_pointers["spin_keys"]:
            pointers["spin_urls"] = [
                cls._check_image(key, reason="invalid_spin_image", missing="missing_spin_object")
                for key in media_pointers["spin_keys"]
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
        prefixes = (f"models/{sku}/", f"{FREE_MODELS_PREFIX}{sku}/")
        return all((media_relative_path(url) or "").startswith(prefixes) for url in urls)

    @staticmethod
    def _spin_is_replaceable(sku: str, existing: Product | None) -> bool:
        """The gallery's rule for the spin: replace it only when every frame came from an
        import. Frames are only ever set by the import, so in practice this is always True;
        a live model's spin is replaced like its other files and waits in the QA queue."""
        if existing is None:
            return True
        prefix = f"{SPIN_PUBLIC_PREFIX}{sku}/"
        return all(
            (media_relative_path(str(url)) or "").startswith(prefix)
            for url in existing.spin_images or ()
        )

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

    @staticmethod
    def _sheet_description(item: dict[str, Any]) -> str:
        return strip_folder_listing(str(item.get("description") or ""))

    @staticmethod
    def _sheet_short_description(item: dict[str, Any]) -> str:
        return strip_folder_listing(str(item.get("short_description") or ""))[:500]

    @classmethod
    def _sheet_text_differs(cls, product: Product, item: dict[str, Any]) -> bool:
        """True when the sheet's text differs from the product's, so the uploader's report
        can say the website kept the administrator's version."""
        if str(item.get("name") or "").strip() != product.name:
            return True
        if cls._sheet_description(item) != (product.description or "").strip():
            return True
        return cls._sheet_short_description(item) != (product.short_description or "").strip()

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
        currency = str(item.get("currency") or "USD").strip().upper() or "USD"
        license_type = str(item.get("license_type") or Product.LicenseType.STANDARD).strip()
        if license_type not in {c.value for c in Product.LicenseType}:
            license_type = Product.LicenseType.STANDARD

        polygon_count = item.get("polygon_count")
        if polygon_count is not None:
            polygon_count = int(polygon_count)

        return ProductService.create_product(
            ProductCreateData(
                category_id=category.pk,
                name=str(item.get("name") or "").strip(),
                description=cls._sheet_description(item),
                short_description=cls._sheet_short_description(item),
                currency=currency,
                thumbnail=media_pointers["thumbnail_url"],
                preview_model=media_pointers["preview_url"],
                polygon_count=polygon_count,
                software_used=str(item.get("software_used") or ""),
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
                spin_images=media_pointers["spin_urls"] or [],
            )
        )

    @classmethod
    def _update_product(
        cls,
        product: Product,
        item: dict[str, Any],
        *,
        sku: str,
        import_batch_id: str,
        import_source: str,
        media_pointers: dict[str, Any],
        live_update: bool = False,
    ) -> Product:
        """Update a re-uploaded model's files only; the administrator owns its text.

        Name, descriptions, category, price, currency, licence, software and the feature
        ticks are set from the sheet on the first upload and edited in /console after
        that, so a re-upload never overwrites them (the packages' prices follow the Free tick in
        ``_sync_packages``). Back to Pending review, except a live model (``live_update``),
        which stays published and is flagged for review by ``_sync_review_flags``.
        """
        polygon_count = item.get("polygon_count")
        clear_polygon = polygon_count is None
        polygon_value: int | None = None if clear_polygon else int(polygon_count)

        return ProductService.update_product(
            product,
            ProductUpdateData(
                thumbnail=media_pointers["thumbnail_url"],
                preview_model=media_pointers["preview_url"],
                polygon_count=polygon_value,
                clear_polygon_count=clear_polygon,
                status=None if live_update else Product.Status.PENDING_REVIEW,
                sku=sku,
                import_batch_id=import_batch_id,
                import_source=import_source,
                glb_checksum=str(item.get("glb_checksum") or "").strip().lower(),
                has_thumbnail=media_pointers["has_thumbnail"],
                has_preview=media_pointers["has_preview"],
                has_package=media_pointers["has_package"],
                package_formats=cls.normalize_package_formats(item.get("package_formats")),
                # None keeps the current spin (absent from the batch); [] clears it.
                spin_images=media_pointers["spin_urls"],
            ),
            source=ProductPriceChange.Source.IMPORT,
        )

    @classmethod
    def _sync_gallery(cls, product: Product, gallery_urls: list[str], *, replace: bool) -> None:
        # A re-import must not delete gallery images an administrator uploaded: the
        # gallery is only replaced when it is empty or every image came from an import.
        if not gallery_urls or not replace:
            return
        ProductImage.objects.filter(product=product).delete()
        images = []
        for index, url in enumerate(gallery_urls):
            # Best-effort: an image that cannot be fetched is stored without colours.
            images.append(
                ProductImage(
                    product=product,
                    image_url=url,
                    display_order=index,
                    is_primary=index == 0,
                    **edge_fields(fetch_side_colours(url)),
                )
            )
        ProductImage.objects.bulk_create(images)

    @staticmethod
    def _sync_review_flags(product: Product, *, live_update: bool) -> None:
        """A live model's update waits for review; any other upload goes through the normal
        queue. A successful upload also clears an earlier "re-upload refused" note."""
        notes = _without_refusal_notes(product.qa_notes)
        if product.pending_update == live_update and notes == (product.qa_notes or "").strip():
            return
        product.pending_update = live_update
        product.qa_notes = notes
        product.save(update_fields=["pending_update", "qa_notes", "updated_at"])

    @classmethod
    def _flag_refused_live_update(cls, row: CatalogImportRowResult, *, import_batch_id: str) -> bool:
        """Put a live model in the QA queue when the website refused its re-upload.

        The uploader sends the files to R2 before it calls the import, so the store may
        already serve the refused files. Returns True when a live model was flagged.
        """
        sku = Product.normalize_sku(row.model_id)
        if sku is None:
            return False
        product = Product.objects.filter(sku=sku, status=Product.Status.PUBLISHED).first()
        if product is None:
            return False
        note = (
            f"{_REFUSED_NOTE_PREFIX}{import_batch_id} was refused ({row.reason or row.action}); "
            "the files in R2 may already have changed. Check the files, then approve or reject."
        )
        product.qa_notes = f"{_without_refusal_notes(product.qa_notes)}\n{note}".strip()
        product.pending_update = True
        product.save(update_fields=["pending_update", "qa_notes", "updated_at"])
        logger.warning(
            "catalog_import_live_update_refused model_id=%s batch_id=%s reason=%s",
            sku,
            import_batch_id,
            row.reason,
        )
        return True

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

    @staticmethod
    def _drops_bought_package(product: Product, packages: list[dict[str, Any]]) -> bool:
        """True when the upload leaves out a package someone bought (or the product was bought
        before packages existed, which covers every package)."""
        incoming = {entry["kind"] for entry in packages}
        dropped = {
            row.package_kind
            for row in product.files.filter(is_preview=False).exclude(package_kind="")
            if row.package_kind not in incoming
        }
        if not dropped:
            return False
        bought = bought_package_kinds(product.pk)
        return "" in bought or bool(dropped & bought)

    @staticmethod
    def _sync_packages(
        product: Product, packages: list[dict[str, Any]], *, free_upload: bool
    ) -> list[str]:
        """One package row per zip the tool made; returns the kinds that are new.

        A re-upload keeps each package's price and sale. A new paid package has no price (not
        sold until priced); every package of a free upload costs 0. A paid package left at 0
        (the model moved out of free-models/) has no price either. A kind the upload no longer
        has is removed (the caller refused the row if someone bought it).
        """
        rows = {
            row.package_kind: row
            for row in product.files.filter(is_preview=False).exclude(package_kind="")
        }
        new_kinds: list[str] = []
        changes: list[tuple[ProductFile, PriceState]] = []
        for entry in packages:
            row = rows.get(entry["kind"])
            if row is not None:
                changes.append((row, PriceState.of(row)))
            if row is None:
                row = ProductFile(
                    product=product,
                    package_kind=entry["kind"],
                    price=Decimal("0.00") if free_upload else None,
                    is_preview=False,
                )
                new_kinds.append(entry["kind"])
            elif free_upload:
                row.price, row.discount_price, row.discount_ends_at = Decimal("0.00"), None, None
            elif row.price == 0:
                row.price = None
            row.file_name = entry["file_name"]
            row.file_format = "zip"
            row.file_size = entry["file_size"]
            row.storage_path = entry["key"]
            row.save()
        incoming = {entry["kind"] for entry in packages}
        for kind, row in rows.items():
            if kind not in incoming:
                row.delete()
        for row, before in changes:
            record_price_change(row, before, source=ProductPriceChange.Source.IMPORT)
        sync_summary_price(product)
        return new_kinds


def spin_frame_keys(sku: str) -> list[str]:
    """The 36 frame keys of a model's 360° spin, in spin order."""
    return [
        f"{SPIN_PUBLIC_PREFIX}{sku}/360_{sku}_{number:02d}.jpg"
        for number in range(1, SPIN_FRAME_COUNT + 1)
    ]


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
