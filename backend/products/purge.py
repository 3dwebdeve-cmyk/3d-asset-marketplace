"""Permanently delete an archived model, with every file it has in storage.

Only an archived model that is in no order can be deleted: an order line is how a buyer
downloads the model, so a bought model stays archived. The database rows go in one
transaction; the stored files are erased after it commits, so a storage hiccup never
undoes the delete (it is logged instead).
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from uuid import UUID

from django.core.files.storage import Storage
from django.db import transaction

from config.media import BATCH_PUBLIC_PREFIX, FREE_MODELS_PREFIX, SPIN_PUBLIC_PREFIX
from config.storages import get_private_storage, get_public_storage
from products.errors import ProductError
from products.models import PRODUCT_SKU_REGEX, Product
from products.storage import ProductMediaStorageService

logger = logging.getLogger(__name__)

NOT_ARCHIVED_MESSAGE = "Archive this model before deleting it permanently."
HAS_ORDERS_MESSAGE = (
    "This model is in a customer's order, so it cannot be deleted permanently. "
    "It stays archived so buyers keep their downloads."
)


def storage_prefixes(product: Product) -> list[str]:
    """Every folder that holds this model's files, in both buckets.

    Console uploads live under products/{images,previews,files}/<id>/; uploader files
    under models/<SKU>/, free-models/<SKU>/ and 360/<SKU>/. SKUs are unique, so those
    folders belong to this model alone.
    """
    product_id = str(product.pk)
    prefixes = [
        f"{ProductMediaStorageService.IMAGE_PREFIX}{product_id}",
        f"{ProductMediaStorageService.PREVIEW_PREFIX}{product_id}",
        f"{ProductMediaStorageService.FILE_PREFIX}{product_id}",
    ]
    sku = product.sku or ""
    # The SKU pattern has no "/" or "..", so it can never point outside its own folder.
    if PRODUCT_SKU_REGEX.fullmatch(sku):
        prefixes += [
            f"{BATCH_PUBLIC_PREFIX}{sku}",
            f"{FREE_MODELS_PREFIX}{sku}",
            f"{SPIN_PUBLIC_PREFIX}{sku}",
        ]
    return [prefix.rstrip("/") for prefix in prefixes]


def iter_storage_keys(storage: Storage, prefix: str) -> Iterator[str]:
    """Every object key under ``prefix`` (works for R2 and local media storage)."""
    try:
        directories, files = storage.listdir(prefix)
    except FileNotFoundError:
        return
    for name in files:
        yield f"{prefix}/{name}"
    for name in directories:
        yield from iter_storage_keys(storage, f"{prefix}/{name}")


def erase_stored_files(prefixes: list[str]) -> int:
    """Delete every object under ``prefixes`` in the public and private buckets."""
    public, private = get_public_storage(), get_private_storage()
    # Without R2 both are the same local storage: walk it once.
    storages = [public] if public is private else [public, private]
    erased = 0
    for storage in storages:
        for prefix in prefixes:
            try:
                keys = list(iter_storage_keys(storage, prefix))
            except Exception:
                logger.exception("product_purge_list_failed prefix=%s", prefix)
                continue
            for key in keys:
                try:
                    storage.delete(key)
                    erased += 1
                except Exception:
                    logger.exception("product_purge_delete_failed key=%s", key)
    return erased


@transaction.atomic
def purge_archived_product(product_id: UUID) -> dict[str, str]:
    """Delete an archived, never-ordered model for good. Returns its name and SKU."""
    from cart.models import CartItem
    from downloads.models import DownloadHistory
    from orders.models import OrderItem
    from reviews.models import Review
    from wishlist.models import WishlistItem

    product = Product.objects.select_for_update().filter(pk=product_id).first()
    if product is None:
        raise ProductError("Product not found.")
    if product.status != Product.Status.ARCHIVED:
        raise ProductError(NOT_ARCHIVED_MESSAGE, field="status")
    if OrderItem.objects.filter(
        product_type=OrderItem.ProductType.PRODUCT, product_id=product.pk
    ).exists():
        raise ProductError(HAS_ORDERS_MESSAGE, field="orders")

    summary = {"name": product.name, "sku": product.sku or ""}
    prefixes = storage_prefixes(product)

    # Rows that point at the model by id only (no foreign key, so no cascade).
    for model in (CartItem, WishlistItem, Review, DownloadHistory):
        model.objects.filter(product_type="product", product_id=product.pk).delete()
    # Images, files, price history and admin notifications cascade with the product.
    product.delete()

    transaction.on_commit(lambda: erase_stored_files(prefixes))
    return summary
