"""Feature 16 Phase 6 — Catalog Import: gate + upsert pending_review by SKU."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction

from categories.models import Category
from config.media import media_relative_path
from config.storages import build_public_media_url
from products.models import PRODUCT_SKU_REGEX, Product, ProductFile, ProductImage
from products.services import (
    ProductCreateData,
    ProductError,
    ProductService,
    ProductUpdateData,
)

logger = logging.getLogger(__name__)

_GLB_CHECKSUM_RE = re.compile(r"^[a-fA-F0-9]{64}$")
_QA_READY = frozenset({"Ready for QA", "Approved"})
_EXPORT_SUCCESS = "Success"
_PACKAGEABLE_EXPORTS = ("fbx", "obj", "max")
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

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model_id": self.model_id,
            "action": self.action,
        }
        if self.reason:
            payload["reason"] = self.reason
        if self.product_id is not None:
            payload["product_id"] = self.product_id
        if self.status is not None:
            payload["status"] = self.status
        return payload


@dataclass(frozen=True)
class CatalogImportBatchResult:
    import_batch_id: str
    created: int
    updated: int
    skipped: int
    failed: int
    results: list[CatalogImportRowResult]

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
        )
        if category is None:
            return CatalogImportRowResult(
                model_id=sku,
                action="skipped",
                reason="category_unmapped",
            )

        media = item.get("media") or {}
        try:
            media_pointers = cls._build_media_pointers(sku, media)
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
                cls._sync_gallery(product, media_pointers["gallery_urls"])
                cls._sync_package(product, media_pointers)
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

        return CatalogImportRowResult(
            model_id=sku,
            action=action,
            product_id=str(product.pk),
            status=product.status,
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
        glb_status = str(exports.get("glb") or "").strip()
        if glb_status != _EXPORT_SUCCESS:
            return "exports_incomplete"
        packageable = any(
            str(exports.get(key) or "").strip() == _EXPORT_SUCCESS
            for key in _PACKAGEABLE_EXPORTS
        )
        if not packageable:
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

        expected_prefix = f"models/{sku}/"
        r2_prefix = str(item.get("r2_key_prefix") or "").strip()
        if r2_prefix != expected_prefix:
            return "invalid_r2_prefix"

        preview_key = str(media.get("preview_key") or "").strip()
        if not preview_key:
            return "missing_preview"

        package_size = media.get("package_file_size")
        if package_size is not None and int(package_size) <= 0:
            return "invalid_export_size"

        return None

    @classmethod
    def resolve_category(
        cls,
        category_name: str,
        subcategory_name: str = "",
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
        return child if child is not None else parent

    @classmethod
    def _normalize_object_key(cls, raw_key: str, *, sku: str) -> str:
        relative = media_relative_path(raw_key.strip())
        if relative is None:
            raise ProductError("invalid_object_key", field="object_key")
        expected_prefix = f"models/{sku}/"
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
    ) -> dict[str, Any]:
        thumbnail_key = cls._normalize_object_key(
            str(media.get("thumbnail_key") or ""),
            sku=sku,
        )
        preview_key = cls._normalize_object_key(
            str(media.get("preview_key") or ""),
            sku=sku,
        )
        if thumbnail_key.endswith("package.zip") or preview_key.endswith("package.zip"):
            raise ProductError("invalid_object_key", field="object_key")

        package_key_raw = str(media.get("package_key") or "").strip()
        package_key: str | None = None
        if package_key_raw:
            package_key = cls._normalize_object_key(package_key_raw, sku=sku)

        gallery_urls: list[str] = []
        for raw in media.get("gallery_keys") or []:
            key = cls._normalize_object_key(str(raw or ""), sku=sku)
            if key.endswith("package.zip"):
                raise ProductError("invalid_object_key", field="object_key")
            gallery_urls.append(build_public_media_url(key))

        return {
            "thumbnail_url": build_public_media_url(thumbnail_key),
            "preview_url": build_public_media_url(preview_key),
            "package_key": package_key,
            "package_file_name": str(media.get("package_file_name") or "package.zip").strip()
            or "package.zip",
            "package_file_format": str(media.get("package_file_format") or "zip").strip().lower()
            or "zip",
            "package_file_size": int(media.get("package_file_size") or 0),
            "gallery_urls": gallery_urls,
            "has_thumbnail": True,
            "has_preview": True,
            "has_package": package_key is not None,
        }

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
            ),
        )

    @classmethod
    def _sync_gallery(cls, product: Product, gallery_urls: list[str]) -> None:
        ProductImage.objects.filter(product=product).delete()
        if not gallery_urls:
            return
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

    @classmethod
    def _sync_package(cls, product: Product, media_pointers: dict[str, Any]) -> None:
        package_key = media_pointers.get("package_key")
        ProductFile.objects.filter(product=product, is_preview=False).delete()
        if not package_key:
            return
        ProductFile.objects.create(
            product=product,
            file_name=media_pointers["package_file_name"][:255],
            file_format=media_pointers["package_file_format"][:32],
            file_size=max(0, int(media_pointers["package_file_size"] or 0)),
            storage_path=package_key,
            version="1.0",
            is_preview=False,
        )
