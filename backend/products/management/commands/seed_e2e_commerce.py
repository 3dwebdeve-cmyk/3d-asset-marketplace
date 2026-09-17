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
from products.models import Product, ProductFile

DEFAULT_BUYER_EMAIL = "e2e-buyer@example.com"
DEFAULT_BUYER_PASSWORD = "E2eBuyerPass123!"
DEFAULT_PRODUCT_SLUG = "e2e-checkout-chair"
DEFAULT_PRODUCT_NAME = "E2E Checkout Chair"
DEFAULT_SKU = "E2E-CHAIR-001"
PACKAGE_STORAGE_PATH = "packages/e2e/e2e-checkout-chair.zip"


class Command(BaseCommand):
    help = (
        "Idempotently seed an E2E buyer account and a published product with a "
        "downloadable package (used by Playwright against Compose)."
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

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        email = str(options["email"]).strip().lower()
        password = str(options["password"])
        slug = str(options["slug"]).strip()

        customer_role = Role.objects.get(role_name="Customer")
        buyer, created = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": "E2E Buyer",
                "role": customer_role,
                "email_verified": True,
            },
        )
        if not created:
            buyer.full_name = "E2E Buyer"
            buyer.role = customer_role
            buyer.email_verified = True
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
        if default_storage.exists(PACKAGE_STORAGE_PATH):
            default_storage.delete(PACKAGE_STORAGE_PATH)
        default_storage.save(PACKAGE_STORAGE_PATH, ContentFile(package_bytes))

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

        self.stdout.write(
            self.style.SUCCESS(
                f"E2E commerce seed ready: buyer={email} product=/{slug}/"
            )
        )

    @staticmethod
    def _build_package_bytes() -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF-binary-e2e")
        return buffer.getvalue()
