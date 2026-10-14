"""Phase J1 — light load smoke on critical marketplace paths.

Exercises healthz, public product browse/detail/search, checkout session
create (Stripe Session.create mocked — no live charges), and public CDN URL
shape when R2 is enabled. Optional soak iterations measure latency and query
counts; fails only on proven N+1 budget breaches or non-success responses.

Does not print secrets. See ``docs/LOAD_SMOKE_CHECKLIST.md``.
"""

from __future__ import annotations

import statistics
import time
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.legal_service import LegalAcceptanceService
from accounts.models import Role, User
from cart.models import Cart, CartItem
from categories.models import Category
from products.models import Product, ProductImage

SMOKE_EMAIL_PREFIX = "load-smoke-"
SMOKE_PRODUCT_SLUG_PREFIX = "load-smoke-"
SMOKE_CATEGORY_SLUG = "load-smoke-props"

# Conservative budgets for critical paths (select_related / list defer already applied).
LIST_QUERY_BUDGET = 6
DETAIL_QUERY_BUDGET = 8
SEARCH_QUERY_BUDGET = 12
# Soft latency advisory only (local/dev hardware varies widely).
LATENCY_ADVISORY_MS = 2000.0


@dataclass(frozen=True)
class LoadSmokeCheck:
    name: str
    ok: bool
    detail: str
    blocking: bool = True
    latency_ms: float | None = None
    query_count: int | None = None


@dataclass(frozen=True)
class LoadSmokeResult:
    checks: tuple[LoadSmokeCheck, ...]
    debug: bool
    iterations: int
    warnings: tuple[str, ...] = field(default_factory=tuple)

    @property
    def blocking_failures(self) -> tuple[LoadSmokeCheck, ...]:
        return tuple(c for c in self.checks if c.blocking and not c.ok)

    @property
    def all_ok(self) -> bool:
        return not self.blocking_failures


class LoadSmokeError(Exception):
    """Operator-facing smoke failure (no secrets in message)."""


def _ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000.0, 2)


def _latency_note(latency_ms: float | None) -> str:
    if latency_ms is None:
        return ""
    if latency_ms > LATENCY_ADVISORY_MS:
        return f"; slow>{LATENCY_ADVISORY_MS:.0f}ms (advisory)"
    return ""


def _public_base() -> str:
    return str(getattr(settings, "R2_PUBLIC_BASE_URL", "") or "").rstrip("/")


def _r2_enabled() -> bool:
    return bool(getattr(settings, "R2_ENABLED", False))


def _ensure_published_fixture() -> tuple[Product, bool]:
    """Return a published product; create a disposable smoke SKU if catalog empty."""
    existing = (
        Product.objects.filter(status=Product.Status.PUBLISHED)
        .select_related("category")
        .order_by("created_at")
        .first()
    )
    if existing is not None:
        return existing, False

    token = uuid.uuid4().hex[:10]
    category, _ = Category.objects.get_or_create(
        slug=SMOKE_CATEGORY_SLUG,
        defaults={"name": "Load Smoke Props"},
    )
    public_base = _public_base()
    if _r2_enabled() and public_base:
        thumb = f"{public_base}/products/images/load-smoke-thumb.jpg"
        image_url = f"{public_base}/products/images/load-smoke-gallery.jpg"
        preview = f"{public_base}/products/previews/load-smoke.glb"
    else:
        thumb = "http://127.0.0.1:8000/media/products/images/load-smoke-thumb.jpg"
        image_url = "http://127.0.0.1:8000/media/products/images/load-smoke-gallery.jpg"
        preview = "http://127.0.0.1:8000/media/products/previews/load-smoke.glb"

    product = Product.objects.create(
        category=category,
        name=f"Load Smoke Asset {token}",
        slug=f"{SMOKE_PRODUCT_SLUG_PREFIX}{token}",
        short_description="Load smoke fixture",
        price=Decimal("12.50"),
        status=Product.Status.PUBLISHED,
        thumbnail=thumb,
        preview_model=preview,
    )
    ProductImage.objects.create(
        product=product,
        image_url=image_url,
        display_order=0,
        is_primary=True,
    )
    return product, True


def _cleanup_fixture(product: Product) -> None:
    slug = product.slug
    ProductImage.objects.filter(product=product).delete()
    product.delete()
    if slug.startswith(SMOKE_PRODUCT_SLUG_PREFIX):
        Category.objects.filter(slug=SMOKE_CATEGORY_SLUG).delete()


def _timed_get(
    client: APIClient,
    path: str,
    *,
    query: dict[str, Any] | None = None,
) -> tuple[Any, float, int]:
    started = time.perf_counter()
    with CaptureQueriesContext(connection) as ctx:
        response = client.get(path, data=query or {})
    return response, _ms(started), len(ctx)


def _check_healthz(client: APIClient) -> LoadSmokeCheck:
    path = reverse("healthz")
    response, latency_ms, query_count = _timed_get(client, path)
    ok = response.status_code == status.HTTP_200_OK
    detail = f"status={response.status_code}; {latency_ms}ms; queries={query_count}"
    detail += _latency_note(latency_ms)
    return LoadSmokeCheck(
        name="healthz",
        ok=ok,
        detail=detail,
        latency_ms=latency_ms,
        query_count=query_count,
    )


def _check_product_list(
    client: APIClient,
    *,
    product: Product,
) -> LoadSmokeCheck:
    path = reverse("products:product-list")
    response, latency_ms, query_count = _timed_get(client, path)
    ok = response.status_code == status.HTTP_200_OK
    detail_parts = [
        f"status={response.status_code}",
        f"{latency_ms}ms",
        f"queries={query_count}",
    ]
    if ok:
        count = response.data.get("count")
        results = response.data.get("results") or []
        detail_parts.append(f"count={count}")
        detail_parts.append(f"page_size={len(results)}")
        if not isinstance(results, list):
            ok = False
            detail_parts.append("results_not_list")
        elif query_count > LIST_QUERY_BUDGET:
            ok = False
            detail_parts.append(
                f"N+1_budget_exceeded(>{LIST_QUERY_BUDGET})"
            )
    detail = "; ".join(detail_parts) + _latency_note(latency_ms)
    # Ensure fixture is visible when we created/used it.
    if ok and product.slug:
        slugs = {row.get("slug") for row in (response.data.get("results") or [])}
        if product.slug not in slugs and int(response.data.get("count") or 0) == 0:
            ok = False
            detail += "; empty_published_catalog"
    return LoadSmokeCheck(
        name="product_list",
        ok=ok,
        detail=detail,
        latency_ms=latency_ms,
        query_count=query_count,
    )


def _check_product_detail(
    client: APIClient,
    *,
    product: Product,
) -> LoadSmokeCheck:
    path = reverse("products:product-detail", kwargs={"slug": product.slug})
    response, latency_ms, query_count = _timed_get(client, path)
    ok = response.status_code == status.HTTP_200_OK
    detail_parts = [
        f"status={response.status_code}",
        f"{latency_ms}ms",
        f"queries={query_count}",
        f"slug={product.slug}",
    ]
    if ok:
        if response.data.get("slug") != product.slug:
            ok = False
            detail_parts.append("slug_mismatch")
        if "storage_path" in response.data:
            ok = False
            detail_parts.append("storage_path_leaked")
        files = response.data.get("files") or []
        for file_row in files:
            if isinstance(file_row, dict) and "storage_path" in file_row:
                ok = False
                detail_parts.append("file_storage_path_leaked")
                break
        if query_count > DETAIL_QUERY_BUDGET:
            ok = False
            detail_parts.append(
                f"N+1_budget_exceeded(>{DETAIL_QUERY_BUDGET})"
            )
    detail = "; ".join(detail_parts) + _latency_note(latency_ms)
    return LoadSmokeCheck(
        name="product_detail",
        ok=ok,
        detail=detail,
        latency_ms=latency_ms,
        query_count=query_count,
    )


def _check_search(
    client: APIClient,
    *,
    product: Product,
) -> LoadSmokeCheck:
    path = reverse("products:product-list")
    # Prefer a distinctive token from the product name (last word / smoke token).
    needle = (product.name or product.slug or "").split()[-1][:40]
    response, latency_ms, query_count = _timed_get(
        client,
        path,
        query={"search": needle},
    )
    ok = response.status_code == status.HTTP_200_OK
    detail_parts = [
        f"status={response.status_code}",
        f"{latency_ms}ms",
        f"queries={query_count}",
        f"q={needle!r}",
    ]
    if ok:
        results = response.data.get("results") or []
        hit = any(
            isinstance(row, dict) and row.get("slug") == product.slug
            for row in results
        )
        detail_parts.append(f"hit={hit}")
        if not hit and int(response.data.get("count") or 0) == 0:
            # A search miss is still OK if the catalog filters differently;
            # require at least a 200 paginated shape — hit is preferred.
            detail_parts.append("no_hit_advisory")
        if query_count > SEARCH_QUERY_BUDGET:
            ok = False
            detail_parts.append(
                f"N+1_budget_exceeded(>{SEARCH_QUERY_BUDGET})"
            )
    detail = "; ".join(detail_parts) + _latency_note(latency_ms)
    return LoadSmokeCheck(
        name="search",
        ok=ok,
        detail=detail,
        latency_ms=latency_ms,
        query_count=query_count,
        blocking=True,
    )


def _is_cdn_url(url: str, base: str) -> bool:
    return bool(url) and (url == base or url.startswith(f"{base}/"))


def _is_placeholder_public_url(url: str) -> bool:
    """Frontend static / Vite fixture URLs used by demo seed when R2 is off."""
    lowered = url.lower()
    markers = (
        "/images/about/",
        "/fixtures/",
        "localhost:5173",
        "127.0.0.1:5173",
    )
    return any(m in lowered for m in markers)


def _check_public_cdn(product: Product, detail_payload: dict[str, Any] | None) -> LoadSmokeCheck:
    base = _public_base()
    r2_on = _r2_enabled()
    if not r2_on:
        return LoadSmokeCheck(
            name="public_cdn",
            ok=True,
            detail="R2_ENABLED=False; local /media/ fallback OK for DEBUG/CI",
            blocking=False,
        )
    if not base:
        return LoadSmokeCheck(
            name="public_cdn",
            ok=False,
            detail="R2_ENABLED=True but R2_PUBLIC_BASE_URL empty",
        )

    # Config wiring: public URL builder must target the CDN base.
    from config.storages import build_public_media_url

    probe = build_public_media_url("products/images/_load_smoke_probe.jpg")
    if not _is_cdn_url(probe, base):
        return LoadSmokeCheck(
            name="public_cdn",
            ok=False,
            detail=(
                f"build_public_media_url does not use R2_PUBLIC_BASE_URL "
                f"(got={probe[:80]!r})"
            ),
        )

    urls: list[str] = []
    for value in (
        product.thumbnail,
        product.preview_model,
        getattr(product, "preview_video", "") or "",
    ):
        if value:
            urls.append(str(value))
    for image in product.images.all():
        if image.image_url:
            urls.append(str(image.image_url))
    if detail_payload:
        for key in ("thumbnail", "preview_model", "preview_video"):
            value = detail_payload.get(key)
            if value:
                urls.append(str(value))
        for image in detail_payload.get("images") or []:
            if isinstance(image, dict) and image.get("image_url"):
                urls.append(str(image["image_url"]))

    off_cdn = [u for u in urls if u and not _is_cdn_url(u, base)]
    placeholders = [u for u in off_cdn if _is_placeholder_public_url(u)]
    other = [u for u in off_cdn if not _is_placeholder_public_url(u)]

    if other:
        sample = other[0][:80]
        return LoadSmokeCheck(
            name="public_cdn",
            ok=False,
            detail=(
                f"R2_PUBLIC_BASE_URL={base}; wiring=ok; "
                f"{len(other)} catalog URL(s) not under CDN "
                f"(sample={sample!r})"
            ),
        )

    if placeholders:
        return LoadSmokeCheck(
            name="public_cdn",
            ok=True,
            detail=(
                f"R2_PUBLIC_BASE_URL={base}; wiring=ok; "
                f"catalog_placeholders={len(placeholders)} "
                "(re-run seed_demo_catalog with R2 on, or publish R2 media)"
            ),
            blocking=False,
        )

    return LoadSmokeCheck(
        name="public_cdn",
        ok=True,
        detail=f"R2_PUBLIC_BASE_URL={base}; wiring=ok; checked={len(urls)} public URL(s)",
    )


def _check_checkout_session(*, product: Product) -> LoadSmokeCheck:
    """POST checkout with verified buyer; mock Stripe Session.create (no live charge)."""
    token = uuid.uuid4().hex[:12]
    email = f"{SMOKE_EMAIL_PREFIX}{token}@example.com"
    role = Role.objects.get(role_name="Customer")
    user = User.objects.create_user(
        email=email,
        full_name="Load Smoke Buyer",
        password=uuid.uuid4().hex,
        role=role,
        email_verified=True,
    )
    LegalAcceptanceService.record_acceptances(
        user,
        LegalAcceptanceService.current_versions(),
    )
    cart, _ = Cart.objects.get_or_create(user=user)
    CartItem.objects.create(
        cart=cart,
        product_type=CartItem.ProductType.PRODUCT,
        product_id=product.pk,
        quantity=1,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    path = reverse("payments:checkout")
    legal = LegalAcceptanceService.current_versions()
    fake_session = MagicMock()
    fake_session.id = f"cs_load_smoke_{token}"
    fake_session.url = f"https://checkout.stripe.com/pay/cs_load_smoke_{token}"

    started = time.perf_counter()
    try:
        with override_settings(STRIPE_SECRET_KEY="sk_test_load_smoke"), patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=fake_session,
        ), CaptureQueriesContext(connection) as ctx:
            response = client.post(
                path,
                {"accepted_legal": legal},
                format="json",
            )
        latency_ms = _ms(started)
        query_count = len(ctx)
        ok = response.status_code == status.HTTP_201_CREATED
        detail_parts = [
            f"status={response.status_code}",
            f"{latency_ms}ms",
            f"queries={query_count}",
        ]
        payload = getattr(response, "data", None)
        if not isinstance(payload, dict):
            payload = {}
        if ok:
            checkout_url = payload.get("checkout_url") or ""
            order_id = payload.get("order_id")
            detail_parts.append(f"order_id={order_id}")
            if not checkout_url:
                ok = False
                detail_parts.append("missing_checkout_url")
            elif "storage_path" in payload:
                ok = False
                detail_parts.append("storage_path_leaked")
        else:
            code = payload.get("code")
            if code:
                detail_parts.append(f"code={code}")
            detail_parts.append(f"body_type={type(response).__name__}")
        return LoadSmokeCheck(
            name="checkout_session",
            ok=ok,
            detail="; ".join(detail_parts) + _latency_note(latency_ms),
            latency_ms=latency_ms,
            query_count=query_count,
        )
    finally:
        from orders.models import Order
        from payments.models import Payment

        Payment.objects.filter(order__user=user).delete()
        Order.objects.filter(user=user).delete()
        CartItem.objects.filter(cart__user=user).delete()
        Cart.objects.filter(user=user).delete()
        user.delete()


def _check_soak(
    client: APIClient,
    *,
    product: Product,
    iterations: int,
) -> LoadSmokeCheck:
    if iterations <= 1:
        return LoadSmokeCheck(
            name="soak",
            ok=True,
            detail="iterations=1 (single pass; use --iterations 20+ for soak)",
            blocking=False,
        )

    list_path = reverse("products:product-list")
    detail_path = reverse(
        "products:product-detail",
        kwargs={"slug": product.slug},
    )
    needle = (product.name or product.slug or "").split()[-1][:40]
    latencies: list[float] = []
    query_counts: list[int] = []
    failures = 0

    for _ in range(iterations):
        for path, query in (
            (list_path, None),
            (detail_path, None),
            (list_path, {"search": needle}),
        ):
            response, latency_ms, query_count = _timed_get(
                client, path, query=query
            )
            latencies.append(latency_ms)
            query_counts.append(query_count)
            if response.status_code != status.HTTP_200_OK:
                failures += 1

    p50 = round(statistics.median(latencies), 2) if latencies else 0.0
    p95_idx = max(0, int(len(latencies) * 0.95) - 1)
    sorted_lat = sorted(latencies)
    p95 = round(sorted_lat[p95_idx], 2) if sorted_lat else 0.0
    max_q = max(query_counts) if query_counts else 0
    min_q = min(query_counts) if query_counts else 0
    # Query count should stay flat across soak (N+1 would often grow / spike).
    spread = max_q - min_q
    ok = failures == 0 and max_q <= max(
        LIST_QUERY_BUDGET, DETAIL_QUERY_BUDGET, SEARCH_QUERY_BUDGET
    )
    detail = (
        f"iterations={iterations}; paths_per_iter=3; failures={failures}; "
        f"p50={p50}ms; p95={p95}ms; queries_min={min_q}; queries_max={max_q}; "
        f"query_spread={spread}"
    )
    if not ok and failures:
        detail += "; non_200_during_soak"
    if max_q > max(LIST_QUERY_BUDGET, DETAIL_QUERY_BUDGET, SEARCH_QUERY_BUDGET):
        detail += "; N+1_budget_exceeded"
        ok = False
    return LoadSmokeCheck(
        name="soak",
        ok=ok,
        detail=detail,
        latency_ms=p95,
        query_count=max_q,
        blocking=True,
    )


def run_load_smoke(*, iterations: int = 1) -> LoadSmokeResult:
    """Run Phase J1 critical-path load smoke."""
    if iterations < 1:
        raise LoadSmokeError("iterations must be >= 1")
    if iterations > 200:
        raise LoadSmokeError("iterations must be <= 200 (keep smoke light)")

    # Same pattern as security_smoke / stripe_smoke — APIClient host is "testserver".
    hosts = list(getattr(settings, "ALLOWED_HOSTS", []) or [])
    for host in ("testserver", "localhost", "127.0.0.1"):
        if host not in hosts:
            hosts.append(host)

    with override_settings(ALLOWED_HOSTS=hosts):
        return _run_load_smoke_inner(iterations=iterations)


def _run_load_smoke_inner(*, iterations: int) -> LoadSmokeResult:
    client = APIClient()
    warnings: list[str] = []
    created_fixture = False
    product: Product | None = None

    try:
        product, created_fixture = _ensure_published_fixture()
        # Refresh images relation for CDN check.
        product = (
            Product.objects.select_related("category")
            .prefetch_related("images")
            .get(pk=product.pk)
        )

        checks: list[LoadSmokeCheck] = [
            _check_healthz(client),
            _check_product_list(client, product=product),
        ]
        detail_check = _check_product_detail(client, product=product)
        checks.append(detail_check)

        detail_payload: dict[str, Any] | None = None
        if detail_check.ok:
            path = reverse(
                "products:product-detail",
                kwargs={"slug": product.slug},
            )
            detail_payload = client.get(path).data

        checks.append(_check_search(client, product=product))
        checks.append(_check_public_cdn(product, detail_payload))
        checks.append(_check_checkout_session(product=product))
        checks.append(
            _check_soak(client, product=product, iterations=iterations)
        )

        for check in checks:
            if (
                check.latency_ms is not None
                and check.latency_ms > LATENCY_ADVISORY_MS
                and check.ok
            ):
                warnings.append(
                    f"{check.name}: latency {check.latency_ms}ms exceeds "
                    f"{LATENCY_ADVISORY_MS:.0f}ms advisory "
                    "(investigate CDN / search / N+1)."
                )

        if not _r2_enabled():
            warnings.append(
                "R2_ENABLED=False — public assets use local media; "
                "confirm R2_PUBLIC_BASE_URL / CDN on staging/prod."
            )
        elif settings.DEBUG:
            warnings.append(
                "DEBUG=True — re-run check_load_smoke on staging/prod host "
                "and record date/initials in docs/LOAD_SMOKE_CHECKLIST.md."
            )

        for check in checks:
            if (
                check.name == "public_cdn"
                and check.ok
                and not check.blocking
                and "catalog_placeholders" in check.detail
            ):
                warnings.append(
                    "public_cdn: catalog still uses frontend placeholder URLs; "
                    "re-run seed_demo_catalog (R2 on) or publish media to the "
                    "public bucket so thumbnails/previews use R2_PUBLIC_BASE_URL."
                )

        return LoadSmokeResult(
            checks=tuple(checks),
            debug=bool(settings.DEBUG),
            iterations=iterations,
            warnings=tuple(warnings),
        )
    finally:
        if created_fixture and product is not None:
            _cleanup_fixture(product)
