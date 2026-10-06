from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, QuerySet
from django.http import FileResponse

from config.media import PrivateFileNotFound, resolve_private_download
from downloads.models import DownloadHistory
from orders.entitlements import user_owns_catalog_item
from orders.models import Order, OrderItem
from plugins.models import Plugin, PluginFile
from products.models import Product, ProductFile
User = get_user_model()
logger = logging.getLogger(__name__)

PRODUCT_TYPE_PRODUCT = DownloadHistory.ProductType.PRODUCT
PRODUCT_TYPE_PLUGIN = DownloadHistory.ProductType.PLUGIN


@dataclass(frozen=True)
class CatalogFileRef:
    product_type: str
    product_id: UUID
    file_id: UUID
    file_name: str
    file_format: str
    file_size: int
    version: str
    storage_path: str


class DownloadError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class DownloadService:
    @classmethod
    def build_download_path(
        cls,
        product_type: str,
        product_id: UUID,
        file_id: UUID,
    ) -> str:
        if product_type == PRODUCT_TYPE_PRODUCT:
            return (
                f"/api/v1/downloads/products/{product_id}/files/{file_id}/download/"
            )
        if product_type == PRODUCT_TYPE_PLUGIN:
            return (
                f"/api/v1/downloads/plugins/{product_id}/files/{file_id}/download/"
            )
        raise DownloadError("Invalid product type.")

    @classmethod
    def list_owned_catalog_keys(cls, user: User) -> list[tuple[str, UUID]]:
        rows = OrderItem.objects.filter(
            order__user=user,
            order__order_status=Order.OrderStatus.PAID,
            order__payment_status=Order.PaymentStatus.PAID,
        ).exclude(order__payment__status="disputed").values_list("product_type", "product_id")
        seen: set[tuple[str, UUID]] = set()
        keys: list[tuple[str, UUID]] = []
        for product_type, product_id in rows:
            key = (product_type, product_id)
            if key not in seen:
                seen.add(key)
                keys.append(key)
        return keys

    @classmethod
    def list_entitlements(cls, user: User) -> list[dict[str, Any]]:
        keys = cls.list_owned_catalog_keys(user)
        if not keys:
            return []

        product_ids = [product_id for ptype, product_id in keys if ptype == PRODUCT_TYPE_PRODUCT]
        plugin_ids = [product_id for ptype, product_id in keys if ptype == PRODUCT_TYPE_PLUGIN]

        products = {
            product.id: product
            for product in Product.objects.filter(pk__in=product_ids).only("id", "name", "slug")
        }
        plugins = {
            plugin.id: plugin
            for plugin in Plugin.objects.filter(pk__in=plugin_ids).only("id", "name", "slug")
        }

        product_files: dict[UUID, list[ProductFile]] = {}
        if product_ids:
            for file_row in ProductFile.objects.filter(
                product_id__in=product_ids,
                is_preview=False,
            ).order_by("-created_at"):
                product_files.setdefault(file_row.product_id, []).append(file_row)

        plugin_files: dict[UUID, list[PluginFile]] = {}
        if plugin_ids:
            for file_row in PluginFile.objects.filter(plugin_id__in=plugin_ids).order_by(
                "-is_primary", "-created_at"
            ):
                plugin_files.setdefault(file_row.plugin_id, []).append(file_row)

        last_downloads = cls._latest_downloads_by_file(user)

        entitlements: list[dict[str, Any]] = []
        for product_type, product_id in keys:
            if product_type == PRODUCT_TYPE_PRODUCT:
                catalog = products.get(product_id)
                files = product_files.get(product_id, [])
            elif product_type == PRODUCT_TYPE_PLUGIN:
                catalog = plugins.get(product_id)
                files = plugin_files.get(product_id, [])
            else:
                continue

            if catalog is None:
                continue

            entitlements.append(
                {
                    "product_type": product_type,
                    "product_id": product_id,
                    "title": catalog.name,
                    "slug": catalog.slug,
                    "files": [
                        cls._serialize_file_metadata(
                            product_type=product_type,
                            product_id=product_id,
                            file_row=file_row,
                            last_downloaded_at=last_downloads.get(file_row.id),
                        )
                        for file_row in files
                    ],
                }
            )

        entitlements.sort(key=lambda item: item["title"].lower())
        return entitlements

    @classmethod
    def list_history_for_user(cls, user: User) -> QuerySet[DownloadHistory]:
        return DownloadHistory.objects.filter(user=user).select_related("order")

    @classmethod
    def list_history_admin(
        cls,
        *,
        user_email: str | None = None,
        product_type: str | None = None,
        product_id: UUID | None = None,
        ordering: str = "-downloaded_at",
    ) -> QuerySet[DownloadHistory]:
        queryset = DownloadHistory.objects.select_related("user", "order")
        if user_email:
            queryset = queryset.filter(user__email__icontains=user_email.strip())
        if product_type:
            queryset = queryset.filter(product_type=product_type)
        if product_id is not None:
            queryset = queryset.filter(product_id=product_id)
        allowed = {"downloaded_at", "-downloaded_at"}
        if ordering not in allowed:
            ordering = "-downloaded_at"
        return queryset.order_by(ordering)

    @classmethod
    def get_product_file(cls, product_id: UUID, file_id: UUID) -> ProductFile:
        try:
            return ProductFile.objects.get(pk=file_id, product_id=product_id, is_preview=False)
        except ProductFile.DoesNotExist as exc:
            raise DownloadError("File not found.") from exc

    @classmethod
    def get_plugin_file(cls, plugin_id: UUID, file_id: UUID) -> PluginFile:
        try:
            return PluginFile.objects.get(pk=file_id, plugin_id=plugin_id)
        except PluginFile.DoesNotExist as exc:
            raise DownloadError("File not found.") from exc

    @classmethod
    def stream_product_file(
        cls, user: User, product_id: UUID, file_id: UUID
    ) -> FileResponse | dict[str, Any]:
        file_row = cls.get_product_file(product_id, file_id)
        if not user_owns_catalog_item(user, PRODUCT_TYPE_PRODUCT, product_id):
            raise DownloadError("File not found.")
        return cls._deliver_owned_file(
            user=user,
            product_type=PRODUCT_TYPE_PRODUCT,
            product_id=product_id,
            file_id=file_row.id,
            file_name=file_row.file_name,
            storage_path=file_row.storage_path,
        )

    @classmethod
    def stream_plugin_file(
        cls, user: User, plugin_id: UUID, file_id: UUID
    ) -> FileResponse | dict[str, Any]:
        file_row = cls.get_plugin_file(plugin_id, file_id)
        if not user_owns_catalog_item(user, PRODUCT_TYPE_PLUGIN, plugin_id):
            raise DownloadError("File not found.")
        return cls._deliver_owned_file(
            user=user,
            product_type=PRODUCT_TYPE_PLUGIN,
            product_id=plugin_id,
            file_id=file_row.id,
            file_name=file_row.file_name,
            storage_path=file_row.storage_path,
        )

    @classmethod
    def list_downloadable_files_for_item(
        cls,
        product_type: str,
        product_id: UUID,
    ) -> list[CatalogFileRef]:
        return cls.list_downloadable_files_for_items(
            [(product_type, product_id)]
        ).get((product_type, product_id), [])

    @classmethod
    def list_downloadable_files_for_items(
        cls,
        keys: list[tuple[str, UUID]],
    ) -> dict[tuple[str, UUID], list[CatalogFileRef]]:
        """Batch-load downloadable files for many order lines (avoids N+1)."""
        result: dict[tuple[str, UUID], list[CatalogFileRef]] = {
            key: [] for key in keys
        }
        product_ids = [product_id for ptype, product_id in keys if ptype == PRODUCT_TYPE_PRODUCT]
        plugin_ids = [product_id for ptype, product_id in keys if ptype == PRODUCT_TYPE_PLUGIN]

        if product_ids:
            for row in ProductFile.objects.filter(
                product_id__in=product_ids,
                is_preview=False,
            ).order_by("-created_at"):
                key = (PRODUCT_TYPE_PRODUCT, row.product_id)
                if key in result:
                    result[key].append(
                        CatalogFileRef(
                            product_type=PRODUCT_TYPE_PRODUCT,
                            product_id=row.product_id,
                            file_id=row.id,
                            file_name=row.file_name,
                            file_format=row.file_format,
                            file_size=row.file_size,
                            version=row.version,
                            storage_path=row.storage_path,
                        )
                    )

        if plugin_ids:
            for row in PluginFile.objects.filter(plugin_id__in=plugin_ids).order_by(
                "-is_primary",
                "-created_at",
            ):
                key = (PRODUCT_TYPE_PLUGIN, row.plugin_id)
                if key in result:
                    result[key].append(
                        CatalogFileRef(
                            product_type=PRODUCT_TYPE_PLUGIN,
                            product_id=row.plugin_id,
                            file_id=row.id,
                            file_name=row.file_name,
                            file_format=row.file_format,
                            file_size=row.file_size,
                            version=row.version,
                            storage_path=row.storage_path,
                        )
                    )

        return result

    @classmethod
    def _serialize_file_metadata(
        cls,
        *,
        product_type: str,
        product_id: UUID,
        file_row: ProductFile | PluginFile,
        last_downloaded_at,
    ) -> dict[str, Any]:
        return {
            "id": file_row.id,
            "file_name": file_row.file_name,
            "file_format": file_row.file_format,
            "file_size": file_row.file_size,
            "version": file_row.version,
            "download_url": cls.build_download_path(product_type, product_id, file_row.id),
            "last_downloaded_at": last_downloaded_at,
        }

    @classmethod
    def _latest_downloads_by_file(cls, user: User) -> dict[UUID, Any]:
        from django.db.models import Max

        rows = (
            DownloadHistory.objects.filter(user=user)
            .values("file_id")
            .annotate(last_downloaded_at=Max("downloaded_at"))
        )
        return {row["file_id"]: row["last_downloaded_at"] for row in rows}

    @classmethod
    def _find_matching_order(
        cls,
        user: User,
        product_type: str,
        product_id: UUID,
    ) -> Order | None:
        item = (
            OrderItem.objects.filter(
                order__user=user,
                order__order_status=Order.OrderStatus.PAID,
                order__payment_status=Order.PaymentStatus.PAID,
                product_type=product_type,
                product_id=product_id,
            )
            .exclude(order__payment__status="disputed")
            .select_related("order")
            .order_by("-order__created_at")
            .first()
        )
        return item.order if item else None

    @classmethod
    def _record_download(
        cls,
        *,
        user: User,
        product_type: str,
        product_id: UUID,
        file_id: UUID,
        file_name: str,
    ) -> None:
        order = cls._find_matching_order(user, product_type, product_id)
        with transaction.atomic():
            DownloadHistory.objects.create(
                user=user,
                product_type=product_type,
                product_id=product_id,
                file_id=file_id,
                file_name=file_name,
                order=order,
            )
            if product_type == PRODUCT_TYPE_PRODUCT:
                Product.objects.filter(pk=product_id).update(
                    total_downloads=F("total_downloads") + 1
                )
            else:
                Plugin.objects.filter(pk=product_id).update(
                    total_downloads=F("total_downloads") + 1
                )

    @classmethod
    def _deliver_owned_file(
        cls,
        *,
        user: User,
        product_type: str,
        product_id: UUID,
        file_id: UUID,
        file_name: str,
        storage_path: str,
    ) -> FileResponse | dict[str, Any]:
        try:
            result = resolve_private_download(storage_path, file_name=file_name)
        except PrivateFileNotFound as exc:
            raise DownloadError("File not found.") from exc

        cls._record_download(
            user=user,
            product_type=product_type,
            product_id=product_id,
            file_id=file_id,
            file_name=file_name,
        )
        logger.info(
            "catalog_download user_id=%s product_type=%s product_id=%s file_id=%s mode=%s",
            user.pk,
            product_type,
            product_id,
            file_id,
            "signed" if isinstance(result, dict) else "stream",
        )
        return result
