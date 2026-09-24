"""Seed deterministic buyer + published product for browser E2E (Compose/CI)."""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Role, User
from categories.models import Category
from plugins.models import Plugin, PluginCategory, PluginFile
from products.models import Product, ProductFile

DEFAULT_BUYER_EMAIL = "e2e-buyer@example.com"
DEFAULT_BUYER_PASSWORD = "E2eBuyerPass123!"
DEFAULT_ADMIN_EMAIL = "e2e-admin@example.com"
DEFAULT_ADMIN_PASSWORD = "E2eAdminPass123!"
DEFAULT_UNVERIFIED_EMAIL = "e2e-unverified@example.com"
DEFAULT_UNVERIFIED_PASSWORD = "E2eUnverifiedPass123!"
DEFAULT_PRODUCT_SLUG = "e2e-checkout-chair"
DEFAULT_PRODUCT_NAME = "E2E Checkout Chair"
DEFAULT_PLUGIN_SLUG = "e2e-checkout-plugin"
DEFAULT_PLUGIN_NAME = "E2E Checkout Plugin"
DEFAULT_SKU = "E2E-CHAIR-001"
PACKAGE_STORAGE_PATH = "packages/e2e/e2e-checkout-chair.zip"
PLUGIN_PACKAGE_STORAGE_PATH = "packages/e2e/e2e-checkout-plugin.zip"


class Command(BaseCommand):
    help = (
        "Idempotently seed E2E fixtures: verified buyer, unverified buyer, "
        "administrator, published product + plugin with downloadable packages "
        "(used by Playwright against Compose)."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--email",
            default=DEFAULT_BUYER_EMAIL,
            help="Buyer email (default: %(default)s)",
        )
        parser.add_argument(
            "--password",
            default=DEFAULT_BUYER_PASSWORD,
            help="Buyer password (default: fixed E2E fixture password)",
        )
        parser.add_argument(
            "--slug",
            default=DEFAULT_PRODUCT_SLUG,
            help="Published product slug (default: %(default)s)",
        )
        parser.add_argument(
            "--admin-email",
            default=DEFAULT_ADMIN_EMAIL,
            help="Administrator email (default: %(default)s)",
        )
        parser.add_argument(
            "--admin-password",
            default=DEFAULT_ADMIN_PASSWORD,
            help="Administrator password (default: fixed E2E fixture password)",
        )
        parser.add_argument(
            "--unverified-email",
            default=DEFAULT_UNVERIFIED_EMAIL,
            help="Unverified buyer email (default: %(default)s)",
        )
        parser.add_argument(
            "--unverified-password",
            default=DEFAULT_UNVERIFIED_PASSWORD,
            help="Unverified buyer password (default: fixed E2E fixture password)",
        )
        parser.add_argument(
            "--plugin-slug",
            default=DEFAULT_PLUGIN_SLUG,
            help="Published plugin slug (default: %(default)s)",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        email = str(options["email"]).strip().lower()
        password = str(options["password"])
        slug = str(options["slug"]).strip()
        admin_email = str(options["admin_email"]).strip().lower()
        admin_password = str(options["admin_password"])
        unverified_email = str(options["unverified_email"]).strip().lower()
        unverified_password = str(options["unverified_password"])
        plugin_slug = str(options["plugin_slug"]).strip()

        customer_role = Role.objects.get(role_name="Customer")
        buyer = self._upsert_customer(
            email=email,
            password=password,
            full_name="E2E Buyer",
            customer_role=customer_role,
            email_verified=True,
        )
        unverified = self._upsert_customer(
            email=unverified_email,
            password=unverified_password,
            full_name="E2E Unverified",
            customer_role=customer_role,
            email_verified=False,
        )
        admin = self._upsert_administrator(
            email=admin_email,
            password=admin_password,
            full_name="E2E Admin",
        )

        from accounts.legal_service import LegalAcceptanceService

        LegalAcceptanceService.record_acceptances(
            buyer,
            LegalAcceptanceService.current_versions(),
        )

        category, _ = Category.objects.get_or_create(
            slug="e2e-furniture",
            defaults={"name": "E2E Furniture"},
        )

        frontend_base = settings.FRONTEND_BASE_URL.rstrip("/")
        preview_model = f"{frontend_base}/fixtures/e2e-preview.glb"

        product, _ = Product.objects.update_or_create(
            slug=slug,
            defaults={
                "category": category,
                "name": DEFAULT_PRODUCT_NAME,
                "sku": DEFAULT_SKU,
                "description": "Deterministic product for browser checkout E2E.",
                "short_description": "E2E checkout fixture",
                "price": Decimal("19.99"),
                "currency": "USD",
                "preview_model": preview_model,
                "has_preview": True,
                "has_package": True,
                "status": Product.Status.PUBLISHED,
            },
        )

        package_bytes = self._build_package_bytes()
        self._save_package(PACKAGE_STORAGE_PATH, package_bytes)

        ProductFile.objects.update_or_create(
            product=product,
            file_name="e2e-checkout-chair.zip",
            defaults={
                "file_format": "ZIP",
                "file_size": len(package_bytes),
                "storage_path": PACKAGE_STORAGE_PATH,
                "version": "1.0",
                "is_preview": False,
            },
        )

        plugin_category, _ = PluginCategory.objects.get_or_create(
            slug="e2e-tools",
            defaults={"name": "E2E Tools"},
        )
        plugin, _ = Plugin.objects.update_or_create(
            slug=plugin_slug,
            defaults={
                "category": plugin_category,
                "name": DEFAULT_PLUGIN_NAME,
                "description": "Deterministic plugin for browser checkout E2E.",
                "short_description": "E2E plugin checkout fixture",
                "price": Decimal("24.99"),
                "currency": "USD",
                "compatibility": "Blender 4.x",
                "status": Plugin.Status.PUBLISHED,
            },
        )

        plugin_package_bytes = self._build_package_bytes()
        self._save_package(PLUGIN_PACKAGE_STORAGE_PATH, plugin_package_bytes)

        PluginFile.objects.update_or_create(
            plugin=plugin,
            file_name="e2e-checkout-plugin.zip",
            defaults={
                "file_format": "zip",
                "file_size": len(plugin_package_bytes),
                "storage_path": PLUGIN_PACKAGE_STORAGE_PATH,
                "version": "1.0",
                "is_primary": True,
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                "E2E commerce seed ready: "
                f"buyer={buyer.email} unverified={unverified.email} "
                f"admin={admin.email} product=/{slug}/ plugin=/{plugin_slug}/"
            )
        )

    def _upsert_customer(
        self,
        *,
        email: str,
        password: str,
        full_name: str,
        customer_role: Role,
        email_verified: bool,
    ) -> User:
        buyer, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": full_name,
                "role": customer_role,
                "email_verified": email_verified,
            },
        )
        if not created:
            buyer.full_name = full_name
            buyer.role = customer_role
            buyer.email_verified = email_verified
            buyer.is_active = True
            buyer.save(
                update_fields=[
                    "full_name",
                    "role",
                    "email_verified",
                    "is_active",
                    "updated_at",
                ]
            )
        buyer.set_password(password)
        buyer.save(update_fields=["password", "updated_at"])
        return buyer

    def _upsert_administrator(
        self,
        *,
        email: str,
        password: str,
        full_name: str,
    ) -> User:
        admin_role, _ = Role.objects.get_or_create(
            role_name="Administrator",
            defaults={"description": "Platform administrator"},
        )
        admin, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": full_name,
                "role": admin_role,
                "email_verified": True,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created:
            admin.set_password(password)
            admin.save(update_fields=["password", "updated_at"])
            return admin

        admin.full_name = full_name
        admin.role = admin_role
        admin.email_verified = True
        admin.is_staff = True
        admin.is_superuser = True
        admin.is_active = True
        admin.set_password(password)
        admin.save(
            update_fields=[
                "full_name",
                "role",
                "email_verified",
                "is_staff",
                "is_superuser",
                "is_active",
                "password",
                "updated_at",
            ]
        )
        return admin

    @staticmethod
    def _save_package(storage_path: str, package_bytes: bytes) -> None:
        if default_storage.exists(storage_path):
            default_storage.delete(storage_path)
        default_storage.save(storage_path, ContentFile(package_bytes))

    @staticmethod
    def _build_package_bytes() -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF-binary-e2e")
        return buffer.getvalue()
