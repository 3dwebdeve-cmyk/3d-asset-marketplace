"""Audit published catalog SKUs for missing private package objects."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from config.media import media_relative_path, private_object_exists
from plugins.models import Plugin, PluginFile
from products.models import Product, ProductFile


@dataclass(frozen=True)
class PackageAuditIssue:
    kind: str
    object_id: str
    label: str
    reason: str
    storage_path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PublishedPackageAuditService:
    """Report published products/plugins that cannot fulfill a paid download."""

    @classmethod
    def audit(cls) -> list[PackageAuditIssue]:
        issues: list[PackageAuditIssue] = []
        issues.extend(cls._audit_products())
        issues.extend(cls._audit_plugins())
        return issues

    @classmethod
    def _audit_products(cls) -> list[PackageAuditIssue]:
        issues: list[PackageAuditIssue] = []
        published = Product.objects.filter(status=Product.Status.PUBLISHED).only(
            "id", "sku", "slug", "name"
        )
        for product in published.iterator():
            label = product.sku or product.slug or product.name
            files = list(
                ProductFile.objects.filter(product_id=product.pk, is_preview=False).only(
                    "storage_path"
                )
            )
            if not files:
                issues.append(
                    PackageAuditIssue(
                        kind="product",
                        object_id=str(product.pk),
                        label=label,
                        reason="no_package",
                    )
                )
                continue
            if not any(cls._package_ok(row.storage_path) for row in files):
                sample = files[0].storage_path
                reason = (
                    "invalid_path"
                    if media_relative_path(sample) is None
                    else "missing_object"
                )
                issues.append(
                    PackageAuditIssue(
                        kind="product",
                        object_id=str(product.pk),
                        label=label,
                        reason=reason,
                        storage_path=sample,
                    )
                )
        return issues

    @classmethod
    def _audit_plugins(cls) -> list[PackageAuditIssue]:
        issues: list[PackageAuditIssue] = []
        published = Plugin.objects.filter(status=Plugin.Status.PUBLISHED).only(
            "id", "slug", "name"
        )
        for plugin in published.iterator():
            label = plugin.slug or plugin.name
            files = list(
                PluginFile.objects.filter(plugin_id=plugin.pk).only("storage_path")
            )
            if not files:
                issues.append(
                    PackageAuditIssue(
                        kind="plugin",
                        object_id=str(plugin.pk),
                        label=label,
                        reason="no_package",
                    )
                )
                continue
            if not any(cls._package_ok(row.storage_path) for row in files):
                sample = files[0].storage_path
                reason = (
                    "invalid_path"
                    if media_relative_path(sample) is None
                    else "missing_object"
                )
                issues.append(
                    PackageAuditIssue(
                        kind="plugin",
                        object_id=str(plugin.pk),
                        label=label,
                        reason=reason,
                        storage_path=sample,
                    )
                )
        return issues

    @staticmethod
    def _package_ok(storage_path: str) -> bool:
        return private_object_exists(storage_path)
