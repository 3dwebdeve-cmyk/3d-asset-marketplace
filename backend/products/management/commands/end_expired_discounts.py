"""Clear sales whose end time has passed, writing a price history row for each.

Housekeeping only: an ended sale is already ignored by Product.active_discount_price, so a
buyer is never charged it even before this runs (docs/PRICING_PIPELINE.md). Safe to repeat.
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from products.models import Product, ProductPriceChange
from products.price_history import PriceState, record_price_change

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Clear the sale price and sale end of models whose sale has ended (history: sale_ended)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List the models whose sale has ended without changing them.",
        )

    def handle(self, *args, **options):
        now = timezone.now()
        expired = (
            Product.objects.filter(discount_ends_at__isnull=False, discount_ends_at__lte=now)
            .order_by("discount_ends_at", "pk")
            .values_list("pk", "sku", "name", "discount_ends_at")
        )
        if options["dry_run"]:
            rows = list(expired)
            for _pk, sku, name, ends_at in rows:
                self.stdout.write(f"{sku or '-'}  {name}  ended {ends_at.isoformat()}")
            self.stdout.write(f"expired_sales={len(rows)} dry_run=True")
            return

        ended = failed = 0
        for pk, *_rest in list(expired):
            try:
                if self._end_sale(pk, now):
                    ended += 1
            except Exception:
                # One bad row must not stop the others; the log has the traceback.
                failed += 1
                logger.exception("expired_sale_end_failed product_id=%s", pk)
        logger.info("expired_sales_ended count=%s failed=%s", ended, failed)
        self.stdout.write(f"expired_sales_ended={ended} failed={failed}")

    @staticmethod
    def _end_sale(pk, now) -> bool:
        with transaction.atomic():
            product = Product.objects.select_for_update().filter(pk=pk).first()
            # Re-checked under the lock: an administrator may have changed the sale meanwhile.
            if (
                product is None
                or product.discount_ends_at is None
                or product.discount_ends_at > now
            ):
                return False
            before = PriceState.of(product)
            product.discount_price = None
            product.discount_ends_at = None
            product.save(update_fields=["discount_price", "discount_ends_at", "updated_at"])
            record_price_change(
                product, before, source=ProductPriceChange.Source.SALE_ENDED, actor=None
            )
        return True
