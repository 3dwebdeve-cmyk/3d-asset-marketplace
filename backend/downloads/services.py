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
    download_kinds_of_line,
    downloads_per_purchase,
    owned_package_kinds,
    paid_order_lines,
)
from orders.models import OrderItem
from plugins.models import Plugin, PluginFile
from products.models import Product, ProductFile
from products.packages import BUNDLE_KIND, PACKAGE_LABELS, PACKAGE_ORDER, PackageKind
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
    def __init__(self, message: str, code: str = "not_found") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


# DownloadError.code when the purchase has no downloads left (the view answers 403).
USED_UP = "downloads_used_up"


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
        rows = paid_order_lines().filter(order__user=user).values_list("product_type", "product_id")
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
        """Every paid item, with the downloads left on each file. A used-up item stays in the
        list (``has_downloads_left`` False) so the page can offer to buy it again."""
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
        # Packages with downloads left: a product page shows Download for these.
        owned_kinds = owned_package_kinds(user, product_ids)
        lines_by_item = cls._paid_lines_by_item(user)

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
            lines = lines_by_item.get((product_type, product_id), [])
            if product_type == PRODUCT_TYPE_PRODUCT:
                catalog = products.get(product_id)
                owned = owned_kinds.get(product_id, frozenset())
                # Only the files bought: one package's zip, the Whole File zip for All variations,
                # or every file for an order from before packages.
                bought = frozenset().union(*(download_kinds_of_line(kind) for kind, _ in lines))
                files = [row for row in product_files.get(product_id, []) if row.package_kind in bought]
                package_kinds = [kind for kind in PACKAGE_ORDER if kind in owned]
                left_by_file = {
                    row.id: sum(
                        left for kind, left in lines if row.package_kind in download_kinds_of_line(kind)
                    )
                    for row in files
                }
            elif product_type == PRODUCT_TYPE_PLUGIN:
                catalog = plugins.get(product_id)
                files = plugin_files.get(product_id, [])
                plugin_left = sum(left for _, left in lines)
                left_by_file = {row.id: plugin_left for row in files}
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
                    # The packages owned with downloads left (so a product page shows Download).
                    "package_kinds": package_kinds,
                    "has_downloads_left": any(left > 0 for left in left_by_file.values()),
                    "files": [
                        cls._serialize_file_metadata(
                            product_type=product_type,
                            product_id=product_id,
                            file_row=file_row,
                            last_downloaded_at=last_downloads.get(file_row.id),
                            downloads_left=left_by_file.get(file_row.id, 0),
                        )
                        for file_row in files
                    ],
                }
            )

        entitlements.sort(key=lambda item: item["title"].lower())
        return entitlements

    @classmethod
    def _paid_lines_by_item(cls, user: User) -> dict[tuple[str, UUID], list[tuple[str, int]]]:
        """(package_kind, downloads left) of each paid line, per (product_type, product_id)."""
        limit = downloads_per_purchase()
        lines: dict[tuple[str, UUID], list[tuple[str, int]]] = {}
        rows = paid_order_lines().filter(order__user=user).values_list(
            "product_type", "product_id", "package_kind", "downloads_used"
        )
        for product_type, product_id, kind, used in rows:
            lines.setdefault((product_type, product_id), []).append((kind, max(0, limit - used)))
        return lines

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
        cls, user: User, product_id: UUID, file_id: UUID, line_id: UUID | None = None
    ) -> FileResponse | dict[str, Any]:
        file_row = cls.get_product_file(product_id, file_id)
        return cls._deliver_owned_file(
            user=user,
            product_type=PRODUCT_TYPE_PRODUCT,
            product_id=product_id,
            file_id=file_row.id,
            file_name=file_row.file_name,
            storage_path=file_row.storage_path,
            package_kind=file_row.package_kind,
            line_id=line_id,
        )

    @classmethod
    def stream_plugin_file(
        cls, user: User, plugin_id: UUID, file_id: UUID, line_id: UUID | None = None
    ) -> FileResponse | dict[str, Any]:
        file_row = cls.get_plugin_file(plugin_id, file_id)
        return cls._deliver_owned_file(
            user=user,
            product_type=PRODUCT_TYPE_PLUGIN,
            product_id=plugin_id,
            file_id=file_row.id,
            file_name=file_row.file_name,
            storage_path=file_row.storage_path,
            line_id=line_id,
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
        downloads_left: int,
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
            "downloads_left": downloads_left,
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
    def _covering_lines(
        cls,
        user: User,
        product_type: str,
        product_id: UUID,
        package_kind: str,
    ) -> QuerySet[OrderItem]:
        """The user's paid lines that give this file (its package, Whole File, All variations
        for the Whole File zip, or a line from before packages), newest first."""
        lines = paid_order_lines().filter(
            order__user=user,
            product_type=product_type,
            product_id=product_id,
        )
        if product_type == PRODUCT_TYPE_PRODUCT:
            kinds = {package_kind, PackageKind.WHOLE, ""}
            if package_kind == PackageKind.WHOLE:
                kinds.add(BUNDLE_KIND)
            lines = lines.filter(package_kind__in=kinds)
        return lines.order_by("-order__created_at", "-created_at")

    @classmethod
    def _claim_download(
        cls,
        user: User,
        product_type: str,
        product_id: UUID,
        package_kind: str,
        line_id: UUID | None,
    ) -> OrderItem:
        """Lock and return the line this download counts against: ``line_id`` when given (the
        order page's link), otherwise the newest covering line with downloads left. Call inside
        a transaction; the caller records the download in it."""
        candidates = cls._covering_lines(user, product_type, product_id, package_kind)
        if line_id is not None:
            candidates = candidates.filter(pk=line_id)
        limit = downloads_per_purchase()
        candidate_ids = list(candidates.values_list("pk", flat=True))
        for pk in candidate_ids:
            # Lock the one row (no joins, so the lock is allowed on every database), then read
            # the count again: a second tab may have taken the last download meanwhile.
            line = OrderItem.objects.select_for_update().get(pk=pk)
            if line.downloads_used < limit:
                return line
        if candidate_ids:
            raise DownloadError(
                f"You have used all {limit} downloads of this purchase. "
                "Buy it again to download it more times.",
                code=USED_UP,
            )
        # Never bought: the same answer as a file that does not exist.
        raise DownloadError("File not found.")

    @classmethod
    def _record_download(
        cls,
        *,
        user: User,
        line: OrderItem,
        product_type: str,
        product_id: UUID,
        file_id: UUID,
        file_name: str,
    ) -> None:
        OrderItem.objects.filter(pk=line.pk).update(downloads_used=F("downloads_used") + 1)
        DownloadHistory.objects.create(
            user=user,
            product_type=product_type,
            product_id=product_id,
            file_id=file_id,
            file_name=file_name,
            order_id=line.order_id,
            order_item=line,
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
        line_id: UUID | None = None,
    ) -> FileResponse | dict[str, Any]:
        """Count one download against a paid line with downloads left, then hand out the
        signed link (or the local file). A missing file counts nothing."""
        with transaction.atomic():
            line = cls._claim_download(user, product_type, product_id, package_kind, line_id)
            try:
                result = resolve_private_download(storage_path, file_name=file_name)
            except PrivateFileNotFound as exc:
                raise DownloadError("File not found.") from exc
            cls._record_download(
                user=user,
                line=line,
                product_type=product_type,
                product_id=product_id,
                file_id=file_id,
                file_name=file_name,
            )
        cls._alert_on_download_spike(user)
        logger.info(
            "catalog_download user_id=%s product_type=%s product_id=%s file_id=%s mode=%s",
            user.pk,
            product_type,
            product_id,
            file_id,
            "signed" if isinstance(result, dict) else "stream",
        )
        return result
