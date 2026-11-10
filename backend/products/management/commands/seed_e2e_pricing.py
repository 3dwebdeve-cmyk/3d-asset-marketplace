"""Seed the pricing pipeline scenario for end-to-end tests (docs/E2E_LOCAL.md).

Run after ``seed_e2e_commerce`` (which creates the E2E admin and buyer). Every run resets the
models below to the same starting state, so a test run can start again from a known point.
Refuses to run unless DEPLOYMENT_PROFILE is test or development.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import storages
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from categories.models import Category
from products.models import Product, ProductFile, ProductPriceChange

BATCH_1 = "e2e-pricing-batch-1"
BATCH_2 = "e2e-pricing-batch-2"


@dataclass(frozen=True)
class Scenario:
    sku: str
    name: str
    status: str
    free: bool
    price: str
    polygons: int | None
    category: str  # "chairs" (subcategory of E2E Furniture) or "lighting"
    batch: str
    sale: str | None = None
    sale_ends_in_hours: int | None = None  # negative: the sale already ended
    pending_update: bool = False


SCENARIOS: tuple[Scenario, ...] = (
    # QA queue
    Scenario("PRC-FREE-QA", "E2E Free Lamp In QA", "pending_review", True, "0.00", 8_000, "lighting", BATCH_1),
    Scenario("PRC-PAID-QA", "E2E Paid Chair In QA", "pending_review", False, "25.00", 50_000, "chairs", BATCH_1),
    # Waiting for price
    Scenario("PRC-WAIT-LOW", "E2E Low Poly Stool", "awaiting_price", False, "0.00", 5_000, "chairs", BATCH_1),
    Scenario("PRC-WAIT-MID", "E2E Mid Poly Armchair", "awaiting_price", False, "30.00", 50_000, "chairs", BATCH_2),
    Scenario("PRC-WAIT-HIGH", "E2E High Poly Sofa", "awaiting_price", False, "0.00", 250_000, "chairs", BATCH_2),
    Scenario("PRC-WAIT-UNKNOWN", "E2E Desk Lamp No Poly Count", "awaiting_price", False, "15.00", None, "lighting", BATCH_2),
    # Live
    Scenario("PRC-LIVE", "E2E Live Dining Chair", "published", False, "40.00", 20_000, "chairs", BATCH_1),
    Scenario("PRC-LIVE-SALE", "E2E Live Lounge Chair On Sale", "published", False, "50.00", 60_000, "chairs", BATCH_1, sale="35.00", sale_ends_in_hours=24 * 7),
    Scenario("PRC-LIVE-ENDED", "E2E Live Floor Lamp Sale Ended", "published", False, "60.00", 30_000, "lighting", BATCH_2, sale="45.00", sale_ends_in_hours=-1),
    Scenario("PRC-LIVE-FREE", "E2E Live Free Pendant Lamp", "published", True, "0.00", 9_000, "lighting", BATCH_2),
    Scenario("PRC-LIVE-UPDATE", "E2E Live Bench With Update", "published", False, "45.00", 40_000, "chairs", BATCH_2, pending_update=True),
)


def _package_bytes(sku: str) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(f"{sku}/readme.txt", f"E2E pricing fixture package for {sku}.\n")
    return buffer.getvalue()


class Command(BaseCommand):
    help = "Reset the pricing pipeline E2E scenario (QA, Waiting for price, Live models)."

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        if getattr(settings, "DEPLOYMENT_PROFILE", "") not in {"test", "development"}:
            raise CommandError("seed_e2e_pricing only runs with DEPLOYMENT_PROFILE=test or development.")

        furniture, _ = Category.objects.get_or_create(slug="e2e-furniture", defaults={"name": "E2E Furniture"})
        chairs, _ = Category.objects.update_or_create(
            slug="e2e-chairs", defaults={"name": "E2E Chairs", "parent": furniture, "is_active": True}
        )
        lighting, _ = Category.objects.update_or_create(
            slug="e2e-lighting", defaults={"name": "E2E Lighting", "parent": None, "is_active": True}
        )
        categories = {"chairs": chairs, "lighting": lighting}
        preview_model = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/fixtures/e2e-preview.glb"
        now = timezone.now()

        for scenario in SCENARIOS:
            sale_ends_at = (
                now + timedelta(hours=scenario.sale_ends_in_hours)
                if scenario.sale_ends_in_hours is not None
                else None
            )
            product, _ = Product.objects.update_or_create(
                sku=scenario.sku,
                defaults={
                    "category": categories[scenario.category],
                    "name": scenario.name,
                    "slug": scenario.sku.lower(),
                    "description": f"End-to-end pricing fixture ({scenario.sku}).",
                    "short_description": "E2E pricing fixture",
                    "price": Decimal(scenario.price),
                    "currency": "USD",
                    "discount_price": Decimal(scenario.sale) if scenario.sale else None,
                    "discount_ends_at": sale_ends_at,
                    "preview_model": preview_model,
                    "polygon_count": scenario.polygons,
                    "preview_triangle_count": scenario.polygons // 4 if scenario.polygons else None,
                    "has_preview": True,
                    "has_package": True,
                    "import_batch_id": scenario.batch,
                    "import_source": "e2e-seed",
                    "status": scenario.status,
                    "pending_update": scenario.pending_update,
                    "reject_reason": "",
                },
            )
            folder = "free-models" if scenario.free else "models"
            key = f"{folder}/{scenario.sku}/{scenario.sku}.zip"
            data = _package_bytes(scenario.sku)
            storage = storages["public" if scenario.free else "private"]
            if storage.exists(key):
                storage.delete(key)
            storage.save(key, ContentFile(data))
            ProductFile.objects.filter(product=product).exclude(storage_path=key).delete()
            ProductFile.objects.update_or_create(
                product=product,
                storage_path=key,
                defaults={
                    "file_name": f"{scenario.sku}.zip",
                    "file_format": "zip",
                    "file_size": len(data),
                    "version": "1.0",
                    "is_preview": False,
                },
            )
            # Start each run with an empty price history for the fixtures.
            ProductPriceChange.objects.filter(product=product).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"E2E pricing seed ready: {len(SCENARIOS)} models "
                f"(SKUs {', '.join(s.sku for s in SCENARIOS)})."
            )
        )
