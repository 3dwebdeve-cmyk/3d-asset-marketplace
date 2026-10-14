"""Idempotently seed a small sellable demo catalog for staging smoke (Phase I1)."""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from PIL import Image

from categories.models import Category
from config.package_audit import PublishedPackageAuditService
from config.storages import build_public_media_url, get_private_storage, get_public_storage
from plugins.models import Plugin, PluginCategory, PluginFile, PluginImage
from products.demo_preview import build_demo_preview
from products.models import Product, ProductFile, ProductImage

DEMO_PRODUCTS = (
    {
        "slug": "demo-oak-chair",
        "name": "Demo Oak Chair",
        "sku": "DEMO-CHAIR-001",
        "price": Decimal("29.99"),
        "short_description": "Staging demo chair with preview + package",
        "image_path": "/images/about/offer-3d-models.jpg",
    },
    {
        "slug": "demo-desk-lamp",
        "name": "Demo Desk Lamp",
        "sku": "DEMO-LAMP-001",
        "price": Decimal("14.99"),
        "short_description": "Staging demo lamp SKU",
        "image_path": "/images/about/offer-3d-models.jpg",
    },
    {
        "slug": "demo-plant-pot",
        "name": "Demo Plant Pot",
        "sku": "DEMO-POT-001",
        "price": Decimal("9.99"),
        "short_description": "Staging demo prop SKU",
        "image_path": "/images/about/offer-3d-models.jpg",
    },
)

DEMO_PLUGINS = (
    {
        "slug": "demo-uv-toolkit",
        "name": "Demo UV Toolkit",
        "price": Decimal("19.99"),
        "short_description": "Staging demo plugin package",
        "compatibility": "Blender 4.x",
        "image_path": "/images/about/offer-plugins.jpg",
    },
    {
        "slug": "demo-batch-exporter",
        "name": "Demo Batch Exporter",
        "price": Decimal("12.99"),
        "short_description": "Staging demo exporter plugin",
        "compatibility": "Blender 3.6+",
        "image_path": "/images/about/offer-plugins.jpg",
    },
)


class Command(BaseCommand):
    help = (
        "Idempotently publish a small demo catalog (products + plugins) with "
        "images, preview GLB, and private packages for staging launch smoke. "
        "Prefer real catalog via /console or Feature 16 import for production."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--unpublish-incomplete",
            action="store_true",
            default=True,
            help=(
                "Unpublish existing published SKUs that fail package audit "
                "(default: on)."
            ),
        )
        parser.add_argument(
            "--keep-incomplete",
            action="store_true",
            help="Do not unpublish incomplete published SKUs before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        unpublish_incomplete = bool(options["unpublish_incomplete"]) and not bool(
            options["keep_incomplete"]
        )
        if unpublish_incomplete:
            unpublished = self._unpublish_incomplete()
            if unpublished:
                self.stdout.write(
                    self.style.WARNING(
                        "Unpublished incomplete SKUs: " + ", ".join(unpublished)
                    )
                )

        category, _ = Category.objects.get_or_create(
            slug="demo-assets",
            defaults={"name": "Demo Assets", "is_active": True},
        )
        plugin_category, _ = PluginCategory.objects.get_or_create(
            slug="demo-tools",
            defaults={"name": "Demo Tools", "is_active": True},
        )

        frontend_base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
        use_r2_public = bool(getattr(settings, "R2_ENABLED", False))

        product_slugs: list[str] = []
        for item in DEMO_PRODUCTS:
            package_path = f"packages/demo/{item['slug']}.zip"
            package_bytes = self._build_package_bytes(item["slug"])
            self._save_package(package_path, package_bytes)
            image_url, preview_model = self._demo_public_urls(
                slug=item["slug"],
                image_path=item["image_path"],
                frontend_base=frontend_base,
                use_r2_public=use_r2_public,
            )

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
                    "thumbnail": image_url,
                    "preview_model": preview_model,
                    "has_thumbnail": True,
                    "has_preview": True,
                    "has_package": True,
                    "status": Product.Status.PUBLISHED,
                },
            )
            ProductFile.objects.update_or_create(
                product=product,
                file_name=f"{item['slug']}.zip",
                defaults={
                    "file_format": "zip",
                    "file_size": len(package_bytes),
                    "storage_path": package_path,
                    "version": "1.0",
                    "is_preview": False,
                },
            )
            ProductImage.objects.update_or_create(
                product=product,
                display_order=0,
                defaults={
                    "image_url": image_url,
                    "is_primary": True,
                },
            )
            product_slugs.append(product.slug)

        plugin_slugs: list[str] = []
        for item in DEMO_PLUGINS:
            package_path = f"packages/demo/{item['slug']}.zip"
            package_bytes = self._build_package_bytes(item["slug"])
            self._save_package(package_path, package_bytes)
            image_url, _ = self._demo_public_urls(
                slug=item["slug"],
                image_path=item["image_path"],
                frontend_base=frontend_base,
                use_r2_public=use_r2_public,
                include_preview=False,
            )

            plugin, _ = Plugin.objects.update_or_create(
                slug=item["slug"],
                defaults={
                    "category": plugin_category,
                    "name": item["name"],
                    "description": item["short_description"],
                    "short_description": item["short_description"],
                    "price": item["price"],
                    "currency": "USD",
                    "thumbnail": image_url,
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
            PluginImage.objects.update_or_create(
                plugin=plugin,
                display_order=0,
                defaults={
                    "image_url": image_url,
                    "is_primary": True,
                },
            )
            plugin_slugs.append(plugin.slug)

        self.stdout.write(
            self.style.SUCCESS(
                "Demo catalog ready: "
                f"products={','.join(product_slugs)} "
                f"plugins={','.join(plugin_slugs)}"
                f"{' (R2 public URLs)' if use_r2_public else ''}. "
                "Run: python manage.py audit_published_packages --fail-on-missing"
            )
        )

    @classmethod
    def _unpublish_incomplete(cls) -> list[str]:
        """Draft any published SKU that cannot fulfill a paid download."""
        labels: list[str] = []
        for issue in PublishedPackageAuditService.audit():
            if issue.kind == "product":
                updated = Product.objects.filter(
                    pk=issue.object_id,
                    status=Product.Status.PUBLISHED,
                ).update(status=Product.Status.DRAFT, has_package=False)
                if updated:
                    labels.append(f"product:{issue.label}")
            elif issue.kind == "plugin":
                updated = Plugin.objects.filter(
                    pk=issue.object_id,
                    status=Plugin.Status.PUBLISHED,
                ).update(status=Plugin.Status.DRAFT)
                if updated:
                    labels.append(f"plugin:{issue.label}")
        return labels

    @classmethod
    def _demo_public_urls(
        cls,
        *,
        slug: str,
        image_path: str,
        frontend_base: str,
        use_r2_public: bool,
        include_preview: bool = True,
    ) -> tuple[str, str]:
        """Return (image_url, preview_model_url). Preview may be empty for plugins."""
        if not use_r2_public:
            image_url = cls._public_asset_url(frontend_base, image_path)
            if not include_preview:
                return image_url, ""
            preview = cls._public_asset_url(frontend_base, f"/fixtures/{slug}.glb")
            return image_url, preview

        image_key = f"products/images/demo/{slug}.jpg"
        cls._save_public_bytes(image_key, cls._tiny_jpeg_bytes())
        image_url = build_public_media_url(image_key)
        if not include_preview:
            return image_url, ""
        preview_key = f"products/previews/demo/{slug}.glb"
        cls._save_public_bytes(preview_key, build_demo_preview(slug))
        return image_url, build_public_media_url(preview_key)

    @staticmethod
    def _public_asset_url(frontend_base: str, path: str) -> str:
        normalized = path if path.startswith("/") else f"/{path}"
        if frontend_base:
            return f"{frontend_base}{normalized}"
        return normalized

    @staticmethod
    def _save_package(storage_path: str, package_bytes: bytes) -> None:
        storage = get_private_storage()
        if storage.exists(storage_path):
            storage.delete(storage_path)
        storage.save(storage_path, ContentFile(package_bytes))

    @staticmethod
    def _save_public_bytes(object_key: str, payload: bytes) -> None:
        storage = get_public_storage()
        if storage.exists(object_key):
            storage.delete(object_key)
        storage.save(object_key, ContentFile(payload))

    @staticmethod
    def _tiny_jpeg_bytes() -> bytes:
        buffer = BytesIO()
        Image.new("RGB", (64, 64), color=(40, 120, 180)).save(
            buffer, format="JPEG", quality=80
        )
        return buffer.getvalue()

    @staticmethod
    def _build_package_bytes(label: str) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", f"glTF-binary-demo-{label}".encode())
        return buffer.getvalue()
