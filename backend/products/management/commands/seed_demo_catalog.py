"""Idempotently seed a small sellable demo catalog for staging smoke (Phase I1)."""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.db import transaction

from categories.models import Category
from plugins.models import Plugin, PluginCategory, PluginFile
from products.models import Product, ProductFile

DEMO_PRODUCTS = (
    {
        "slug": "demo-oak-chair",
        "name": "Demo Oak Chair",
        "sku": "DEMO-CHAIR-001",
        "price": Decimal("29.99"),
        "short_description": "Staging demo chair with preview + package",
    },
    {
        "slug": "demo-desk-lamp",
        "name": "Demo Desk Lamp",
        "sku": "DEMO-LAMP-001",
        "price": Decimal("14.99"),
        "short_description": "Staging demo lamp SKU",
    },
    {
        "slug": "demo-plant-pot",
        "name": "Demo Plant Pot",
        "sku": "DEMO-POT-001",
        "price": Decimal("9.99"),
        "short_description": "Staging demo prop SKU",
    },
)

DEMO_PLUGINS = (
    {
        "slug": "demo-uv-toolkit",
        "name": "Demo UV Toolkit",
        "price": Decimal("19.99"),
        "short_description": "Staging demo plugin package",
        "compatibility": "Blender 4.x",
    },
    {
        "slug": "demo-batch-exporter",
        "name": "Demo Batch Exporter",
        "price": Decimal("12.99"),
        "short_description": "Staging demo exporter plugin",
        "compatibility": "Blender 3.6+",
    },
)


class Command(BaseCommand):
    help = (
        "Idempotently publish a small demo catalog (products + plugins) with "
        "private packages for staging launch smoke. Prefer real catalog via "
        "/console or Feature 16 import for production."
    )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        category, _ = Category.objects.get_or_create(
            slug="demo-assets",
            defaults={"name": "Demo Assets", "is_active": True},
        )
        plugin_category, _ = PluginCategory.objects.get_or_create(
            slug="demo-tools",
            defaults={"name": "Demo Tools", "is_active": True},
        )

        frontend_base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
        preview_model = (
            f"{frontend_base}/fixtures/e2e-preview.glb"
            if frontend_base
            else "/fixtures/e2e-preview.glb"
        )

        product_slugs: list[str] = []
        for item in DEMO_PRODUCTS:
            package_path = f"packages/demo/{item['slug']}.zip"
            package_bytes = self._build_package_bytes(item["slug"])
            self._save_package(package_path, package_bytes)

            product, _ = Product.objects.update_or_create(
                slug=item["slug"],
                defaults={
                    "category": category,
                    "name": item["name"],
                    "sku": item["sku"],
                    "description": item["short_description"],
                    "short_description": item["short_description"],
                    "price": item["price"],
                    "currency": "USD",
                    "preview_model": preview_model,
                    "has_preview": True,
                    "has_package": True,
                    "status": Product.Status.PUBLISHED,
                },
            )
            ProductFile.objects.update_or_create(
                product=product,
                file_name=f"{item['slug']}.zip",
                defaults={
                    "file_format": "ZIP",
                    "file_size": len(package_bytes),
                    "storage_path": package_path,
                    "version": "1.0",
                    "is_preview": False,
                },
            )
            product_slugs.append(product.slug)

        plugin_slugs: list[str] = []
        for item in DEMO_PLUGINS:
            package_path = f"packages/demo/{item['slug']}.zip"
            package_bytes = self._build_package_bytes(item["slug"])
            self._save_package(package_path, package_bytes)

            plugin, _ = Plugin.objects.update_or_create(
                slug=item["slug"],
                defaults={
                    "category": plugin_category,
                    "name": item["name"],
                    "description": item["short_description"],
                    "short_description": item["short_description"],
                    "price": item["price"],
                    "currency": "USD",
                    "compatibility": item["compatibility"],
                    "status": Plugin.Status.PUBLISHED,
                },
            )
            PluginFile.objects.update_or_create(
                plugin=plugin,
                file_name=f"{item['slug']}.zip",
                defaults={
                    "file_format": "zip",
                    "file_size": len(package_bytes),
                    "storage_path": package_path,
                    "version": "1.0",
                    "is_primary": True,
                },
            )
            plugin_slugs.append(plugin.slug)

        self.stdout.write(
            self.style.SUCCESS(
                "Demo catalog ready: "
                f"products={','.join(product_slugs)} "
                f"plugins={','.join(plugin_slugs)}. "
                "Run: python manage.py reindex_search && "
                "python manage.py audit_published_packages --fail-on-missing"
            )
        )

    @staticmethod
    def _save_package(storage_path: str, package_bytes: bytes) -> None:
        if default_storage.exists(storage_path):
            default_storage.delete(storage_path)
        default_storage.save(storage_path, ContentFile(package_bytes))

    @staticmethod
    def _build_package_bytes(label: str) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", f"glTF-binary-demo-{label}".encode())
        return buffer.getvalue()
