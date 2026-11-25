from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, QuerySet
from django.http import FileResponse
from django.utils import timezone

from config.media import PrivateFileNotFound, resolve_private_download
from config.sentry import capture_download_spike
from downloads.models import DownloadHistory
from orders.entitlements import (
    download_kinds_by_product,
    download_kinds_of_line,
    owned_package_kinds,
    user_owns_catalog_item,
)
from orders.models import Order, OrderItem
from plugins.models import Plugin, PluginFile
from products.models import Product, ProductFile
from products.packages import BUNDLE_KIND, PACKAGE_LABELS, PACKAGE_ORDER, SINGLE_KINDS, PackageKind
User = get_user_model()
logger = logging.getLogger(__name__)

PRODUCT_TYPE_PRODUCT = DownloadHistory.ProductType.PRODUCT
PRODUCT_TYPE_PLUGIN = DownloadHistory.ProductType.PLUGIN


def _package_sort_key(row: ProductFile) -> tuple[int, float]:
    """Packages in PACKAGE_ORDER, then files without a kind (newest first among those)."""
    if row.package_kind in PACKAGE_ORDER:
        return (PACKAGE_ORDER.index(row.package_kind), 0.0)
    return (len(PACKAGE_ORDER), -row.created_at.timestamp() if row.created_at else 0.0)


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
    def downloadable_product_files(
        cls, product_ids: list[UUID]
    ) -> dict[UUID, list[ProductFile]]:
        """Private package files per product, in PACKAGE_ORDER (files without a kind last).

        Public previews are never sold: anyone can already fetch them, so a product
        without a package has nothing to download (``audit_published_packages``). Callers
        keep only the kinds the buyer owns.
        """
        files: dict[UUID, list[ProductFile]] = {}
        if not product_ids:
            return files
        rows = ProductFile.objects.filter(product_id__in=product_ids, is_preview=False)
        for file_row in sorted(rows, key=_package_sort_key):
            files.setdefault(file_row.product_id, []).append(file_row)
        return files

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

        product_files = cls.downloadable_product_files(product_ids)
        owned_kinds = owned_package_kinds(user, product_ids)
        download_kinds = download_kinds_by_product(user, product_ids)

        plugin_files: dict[UUID, list[PluginFile]] = {}
        if plugin_ids:
            for file_row in PluginFile.objects.filter(plugin_id__in=plugin_ids).order_by(
                "-is_primary", "-created_at"
            ):
                plugin_files.setdefault(file_row.plugin_id, []).append(file_row)

        last_downloads = cls._latest_downloads_by_file(user)

        entitlements: list[dict[str, Any]] = []
        for product_type, product_id in keys:
            package_kinds: list[str] = []
            if product_type == PRODUCT_TYPE_PRODUCT:
                catalog = products.get(product_id)
                owned = owned_kinds.get(product_id, frozenset())
                # Only the files bought: one package's zip, the Whole File zip for All variations,
                # or every file for an order from before packages.
                downloadable = download_kinds.get(product_id, frozenset())
                files = [row for row in product_files.get(product_id, []) if row.package_kind in downloadable]
                package_kinds = [kind for kind in SINGLE_KINDS if kind in owned]
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
                    # The packages owned (so a product page shows Download for them).
                    "package_kinds": package_kinds,
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

    @staticmethod
    def package_labels(rows) -> dict[UUID, str]:
        """The package label of each model file in these download history rows, by file id."""
        file_ids = {row.file_id for row in rows if row.product_type == PRODUCT_TYPE_PRODUCT}
        if not file_ids:
            return {}
        return {
            file_id: PACKAGE_LABELS.get(kind, "")
            for file_id, kind in ProductFile.objects.filter(pk__in=file_ids).values_list(
                "id", "package_kind"
            )
        }

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
        allowed = cls.downloadable_product_files([product_id]).get(product_id, [])
        for file_row in allowed:
            if file_row.pk == file_id:
                return file_row
        raise DownloadError("File not found.")

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
        # Only a file the user bought (the same answer whether the file exists or not).
        if file_row.package_kind not in download_kinds_by_product(user, [product_id]).get(product_id, ()):
            raise DownloadError("File not found.")
        return cls._deliver_owned_file(
            user=user,
            product_type=PRODUCT_TYPE_PRODUCT,
            product_id=product_id,
            file_id=file_row.id,
            file_name=file_row.file_name,
            storage_path=file_row.storage_path,
            package_kind=file_row.package_kind,
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
    def list_downloadable_files_for_items(
        cls,
        keys: list[tuple[str, UUID, str]],
    ) -> dict[tuple[str, UUID, str], list[CatalogFileRef]]:
        """Batch-load the files of many order lines, (product_type, product_id, package_kind),
        without N+1: a model line gives its package's zip, or every file for Whole File and a
        line from before packages."""
        result: dict[tuple[str, UUID, str], list[CatalogFileRef]] = {
            key: [] for key in keys
        }
        product_ids = [product_id for ptype, product_id, _ in keys if ptype == PRODUCT_TYPE_PRODUCT]
        plugin_ids = [product_id for ptype, product_id, _ in keys if ptype == PRODUCT_TYPE_PLUGIN]

        if product_ids:
            product_rows = cls.downloadable_product_files(product_ids)
            for key in result:
                ptype, product_id, kind = key
                if ptype != PRODUCT_TYPE_PRODUCT:
                    continue
                covered = download_kinds_of_line(kind)
                for row in product_rows.get(product_id, []):
                    if row.package_kind not in covered:
                        continue
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
                key = (PRODUCT_TYPE_PLUGIN, row.plugin_id, "")
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
        package_kind = getattr(file_row, "package_kind", "")
        return {
            "id": file_row.id,
            # The package this zip is ("" for a plugin file or a file without a kind).
            "package_kind": package_kind,
            "package_label": PACKAGE_LABELS.get(package_kind, ""),
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
        package_kind: str,
    ) -> Order | None:
        """The latest paid order whose line gives this file (its package, Whole File, or a
        line from before packages)."""
        lines = OrderItem.objects.filter(
            order__user=user,
            order__order_status=Order.OrderStatus.PAID,
            order__payment_status=Order.PaymentStatus.PAID,
            product_type=product_type,
            product_id=product_id,
        )
        if product_type == PRODUCT_TYPE_PRODUCT:
            # A line from before packages, and an old Whole File line, give every file.
            kinds = {package_kind, PackageKind.WHOLE, ""}
            if package_kind == PackageKind.WHOLE:
                kinds.add(BUNDLE_KIND)
            lines = lines.filter(package_kind__in=kinds)
        item = (
            lines
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
        package_kind: str,
    ) -> None:
        order = cls._find_matching_order(user, product_type, product_id, package_kind)
        with transaction.atomic():
            DownloadHistory.objects.create(
                user=user,
                product_type=product_type,
                product_id=product_id,
                file_id=file_id,
                file_name=file_name,
                order=order,
            )
            # total_downloads counts links issued. Downloads from R2 go straight to the
            # browser, so completed transfers are not visible here.
            if product_type == PRODUCT_TYPE_PRODUCT:
                Product.objects.filter(pk=product_id).update(
                    total_downloads=F("total_downloads") + 1
                )
            else:
                Plugin.objects.filter(pk=product_id).update(
                    total_downloads=F("total_downloads") + 1
                )
        cls._alert_on_download_spike(user)

    @classmethod
    def _alert_on_download_spike(cls, user: User) -> None:
        threshold = int(getattr(settings, "DOWNLOAD_ALERT_LINKS_PER_HOUR", 50) or 0)
        if threshold <= 0:
            return
        links_last_hour = DownloadHistory.objects.filter(
            user=user,
            downloaded_at__gte=timezone.now() - timedelta(hours=1),
        ).count()
        # Fires once as the account crosses the threshold, not on every later link.
        if links_last_hour == threshold:
            logger.warning(
                "download_spike user_id=%s links_last_hour=%s", user.pk, links_last_hour
            )
            capture_download_spike(user_id=str(user.pk), links_last_hour=links_last_hour)

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
        package_kind: str = "",
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
            package_kind=package_kind,
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
