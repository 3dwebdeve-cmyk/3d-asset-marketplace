from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db.models import QuerySet

from orders.models import Order, OrderItem
from products.packages import PACKAGE_KINDS, PackageKind

User = get_user_model()

# What a Whole File line gives, and a line bought before packages existed: every package, plus
# "" for the files added before packages, which have no kind (D7). No buyer loses a file.
EVERY_PACKAGE: frozenset[str] = PACKAGE_KINDS | {""}


def paid_order_lines() -> QuerySet[OrderItem]:
    """Order lines that entitle their buyer: a paid order whose payment is not disputed."""
    return OrderItem.objects.filter(
        order__order_status=Order.OrderStatus.PAID,
        order__payment_status=Order.PaymentStatus.PAID,
    ).exclude(order__payment__status="disputed")


def kinds_of_line(kind: str) -> frozenset[str]:
    """The package kinds one product order line gives: its own, or every one for Whole File
    and for a line from before packages (blank kind)."""
    return EVERY_PACKAGE if kind in ("", PackageKind.WHOLE) else frozenset({kind})


def owned_package_kinds(user: User, product_ids: Iterable[UUID]) -> dict[UUID, frozenset[str]]:
    """For each product, the package kinds the user owns ("" = the files without a kind), in
    one query. A product the user owns nothing of is left out. Free models are not here:
    anyone downloads them from the product page."""
    product_ids = set(product_ids)
    if not product_ids:
        return {}
    owned: dict[UUID, frozenset[str]] = {}
    rows = paid_order_lines().filter(
        order__user=user,
        product_type=OrderItem.ProductType.PRODUCT,
        product_id__in=product_ids,
    ).values_list("product_id", "package_kind")
    for product_id, kind in rows:
        owned[product_id] = owned.get(product_id, frozenset()) | kinds_of_line(kind)
    return owned


def user_owns_catalog_item(
    user: User,
    product_type: str,
    product_id: UUID,
) -> bool:
    """The user owns the plugin, or at least one package of the model (enough to review it).
    The cart and downloads check each package with ``owned_package_kinds``."""
    return paid_order_lines().filter(
        order__user=user,
        product_type=product_type,
        product_id=product_id,
    ).exists()


def owned_line_keys(user: User, keys: Iterable[tuple[str, UUID, str]]) -> set[tuple[str, UUID, str]]:
    """Which of these cart lines, (product_type, product_id, package_kind), the user already
    owns: a package by ``owned_package_kinds``, a plugin by any paid line. Two queries."""
    keys = set(keys)
    product_ids = {pk for kind, pk, _ in keys if kind == OrderItem.ProductType.PRODUCT}
    plugin_ids = {pk for kind, pk, _ in keys if kind == OrderItem.ProductType.PLUGIN}
    packages = owned_package_kinds(user, product_ids)
    plugins = set(
        paid_order_lines()
        .filter(order__user=user, product_type=OrderItem.ProductType.PLUGIN, product_id__in=plugin_ids)
        .values_list("product_id", flat=True)
    ) if plugin_ids else set()
    return {
        key
        for key in keys
        if (key[0] == OrderItem.ProductType.PRODUCT and key[2] in packages.get(key[1], ()))
        or (key[0] == OrderItem.ProductType.PLUGIN and key[1] in plugins)
    }


def bought_package_kinds(product_id: UUID) -> set[str]:
    """The package kinds of a product that someone bought. A blank kind (a line bought before
    packages existed) means every package; the caller decides what that covers."""
    return set(
        paid_order_lines()
        .filter(product_type=OrderItem.ProductType.PRODUCT, product_id=product_id)
        .values_list("package_kind", flat=True)
        .distinct()
    )


def order_allows_download(order: Order) -> bool:
    return (
        order.order_status == Order.OrderStatus.PAID
        and order.payment_status == Order.PaymentStatus.PAID
        and getattr(getattr(order, "payment", None), "status", None) != "disputed"
    )
