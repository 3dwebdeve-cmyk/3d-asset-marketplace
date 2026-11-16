"""Clear sales whose end time has passed, writing a price history row for each.

Housekeeping only: an ended sale is already ignored by active_discount_price, so a buyer is
never charged it even before this runs (docs/PRICING_PIPELINE.md). Sales live on the packages
(docs/PACKAGES_PIPELINE.md); after a package's sale ends, its product's summary price follows.
A product's own sale fields are cleared too (a model without packages). Safe to repeat.
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from products.models import Product, ProductFile, ProductPriceChange
from products.packages import sync_summary_price
from products.price_history import PriceState, record_price_change

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Clear the sale price and sale end of packages and models whose sale has ended (history: sale_ended)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List the sales that have ended without changing them.",
        )

    def handle(self, *args, **options):
        now = timezone.now()
        # Packages first: ending one updates its product's summary, which may end its sale.
        sources = (
            ProductFile.objects.select_related("product")
            .filter(is_preview=False)
            .exclude(package_kind=""),
            Product.objects.all(),
        )
        expired = [
            row
            for queryset in sources
            for row in queryset.filter(
                discount_ends_at__isnull=False, discount_ends_at__lte=now
            ).order_by("discount_ends_at", "pk")
        ]
        if options["dry_run"]:
            for row in expired:
                product = row.product if isinstance(row, ProductFile) else row
                kind = f" ({row.package_kind})" if isinstance(row, ProductFile) else ""
                self.stdout.write(
                    f"{product.sku or '-'}  {product.name}{kind}  ended {row.discount_ends_at.isoformat()}"
                )
            self.stdout.write(f"expired_sales={len(expired)} dry_run=True")
            return

        ended = failed = 0
        for row in expired:
            model = type(row)
            try:
                if self._end_sale(model, row.pk, now):
                    ended += 1
            except Exception:
                # One bad row must not stop the others; the log has the traceback.
                failed += 1
                logger.exception("expired_sale_end_failed model=%s id=%s", model.__name__, row.pk)
        logger.info("expired_sales_ended count=%s failed=%s", ended, failed)
        self.stdout.write(f"expired_sales_ended={ended} failed={failed}")

    @staticmethod
    def _end_sale(model, pk, now) -> bool:
        with transaction.atomic():
            priced = model.objects.select_for_update().filter(pk=pk).first()
            # Re-checked under the lock: an administrator may have changed the sale meanwhile
            # (or, for a product, its package's sale ended first and the summary followed).
            if priced is None or priced.discount_ends_at is None or priced.discount_ends_at > now:
                return False
            before = PriceState.of(priced)
            priced.discount_price = None
            priced.discount_ends_at = None
            priced.save(update_fields=["discount_price", "discount_ends_at", "updated_at"])
            record_price_change(
                priced, before, source=ProductPriceChange.Source.SALE_ENDED, actor=None
            )
            if isinstance(priced, ProductFile):
                sync_summary_price(priced.product)
        return True
