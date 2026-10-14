from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Max, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from accounts.models import User
from categories.models import Category
from orders.models import Order, OrderItem
from payments.models import Payment
from plugins.models import Plugin
from products.models import Product


class AnalyticsError(Exception):
    def __init__(self, message: str, *, field: str | None = None) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


@dataclass(frozen=True)
class CategoryBreakdownItem:
    id: UUID
    name: str
    slug: str
    is_active: bool
    product_count: int
    published_product_count: int


def _parse_day_bound(
    value: str | None,
    *,
    field: str,
    end_of_day: bool,
) -> datetime | date | None:
    if not value:
        return None
    raw = value.strip()
    parsed_dt = parse_datetime(raw)
    if parsed_dt is not None:
        if timezone.is_naive(parsed_dt):
            return timezone.make_aware(parsed_dt, timezone.get_current_timezone())
        return parsed_dt
    parsed_day = parse_date(raw)
    if parsed_day is None:
        raise AnalyticsError("Invalid date filter.", field=field)
    if end_of_day:
        return parsed_day
    return parsed_day


def _apply_created_at_bounds(queryset, *, start: datetime | date | None, end: datetime | date | None):
    if isinstance(start, date) and not isinstance(start, datetime):
        queryset = queryset.filter(created_at__date__gte=start)
    elif start is not None:
        queryset = queryset.filter(created_at__gte=start)

    if isinstance(end, date) and not isinstance(end, datetime):
        queryset = queryset.filter(created_at__date__lte=end)
    elif end is not None:
        queryset = queryset.filter(created_at__lte=end)

    return queryset


def _default_date_range() -> tuple[date, date]:
    today = timezone.localdate()
    start = today.replace(day=1)
    return start, today


def _money(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return value.quantize(Decimal("0.01"))


class DashboardStatsService:
    DEFAULT_CURRENCY = "USD"

    @classmethod
    def _current_month_sales(cls) -> dict[str, Any]:
        today = timezone.localdate()
        month_start = today.replace(day=1)
        # Revenue is reported in DEFAULT_CURRENCY only; there are no FX rates here.
        paid_orders = Order.objects.filter(
            payment_status=Order.PaymentStatus.PAID,
            currency=cls.DEFAULT_CURRENCY,
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        )
        aggregates = paid_orders.aggregate(
            revenue=Coalesce(
                Sum("total_amount"),
                Value(Decimal("0.00")),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            order_count=Count("id"),
        )
        return {
            "monthly_revenue": _money(aggregates["revenue"]),
            "monthly_orders": aggregates["order_count"],
            "currency": cls.DEFAULT_CURRENCY,
        }

    @classmethod
    def get_admin_stats(cls) -> dict[str, Any]:
        users = User.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
        )
        product_counts = Product.objects.aggregate(
            total=Count("id"),
            published=Count("id", filter=Q(status=Product.Status.PUBLISHED)),
            draft=Count("id", filter=Q(status=Product.Status.DRAFT)),
            archived=Count("id", filter=Q(status=Product.Status.ARCHIVED)),
        )
        category_counts = Category.objects.aggregate(
            total=Count("id"),
            live=Count("id", filter=Q(is_active=True)),
        )
        plugin_counts = Plugin.objects.aggregate(total=Count("id"))
        payment_counts = Payment.objects.aggregate(
            succeeded=Count("id", filter=Q(status=Payment.Status.SUCCEEDED)),
            pending=Count("id", filter=Q(status=Payment.Status.PENDING)),
        )

        category_breakdown = [
            CategoryBreakdownItem(
                id=row["id"],
                name=row["name"],
                slug=row["slug"],
                is_active=row["is_active"],
                product_count=row["product_count"],
                published_product_count=row["published_product_count"],
            )
            for row in (
                Category.objects.filter(is_active=True)
                .annotate(
                    product_count=Count("products", distinct=True),
                    published_product_count=Count(
                        "products",
                        filter=Q(products__status=Product.Status.PUBLISHED),
                        distinct=True,
                    ),
                )
                .order_by("name")
                .values(
                    "id",
                    "name",
                    "slug",
                    "is_active",
                    "product_count",
                    "published_product_count",
                )
            )
        ]

        return {
            "users": {
                "total": users["total"],
                "active": users["active"],
            },
            "products": {
                "total": product_counts["total"],
                "published": product_counts["published"],
                "draft": product_counts["draft"],
                "archived": product_counts["archived"],
            },
            "categories": {
                "total": category_counts["total"],
                "live": category_counts["live"],
            },
            "plugins": {
                "total": plugin_counts["total"],
            },
            "sales": cls._current_month_sales(),
            "payments": {
                "succeeded": payment_counts["succeeded"],
                "pending": payment_counts["pending"],
            },
            "category_breakdown": category_breakdown,
        }


class AnalyticsService:
    """Order-based admin analytics. Gateway breakdown is included for forward compatibility."""

    DEFAULT_CURRENCY = "USD"
    TOP_LIMIT = 10
    MAX_RANGE_DAYS = 366

    @classmethod
    def resolve_date_range(
        cls,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> tuple[date, date]:
        default_start, default_end = _default_date_range()
        start = _parse_day_bound(start_date, field="start_date", end_of_day=False)
        end = _parse_day_bound(end_date, field="end_date", end_of_day=True)

        if start is None:
            start = default_start
        if end is None:
            end = default_end

        if isinstance(start, datetime):
            start = timezone.localtime(start).date()
        if isinstance(end, datetime):
            end = timezone.localtime(end).date()

        if start > end:
            raise AnalyticsError(
                "start_date must be on or before end_date.",
                field="start_date",
            )

        if (end - start).days > cls.MAX_RANGE_DAYS:
            raise AnalyticsError(
                f"Date range cannot exceed {cls.MAX_RANGE_DAYS} days.",
                field="end_date",
            )

        return start, end

    @classmethod
    def get_order_analytics(
        cls,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        start, end = cls.resolve_date_range(start_date=start_date, end_date=end_date)

        orders = _apply_created_at_bounds(
            Order.objects.all(),
            start=start,
            end=end,
        )
        # Revenue is reported in DEFAULT_CURRENCY only. Counts cover every currency,
        # and the summary reports how many orders were left out of the money totals.
        usd_orders = orders.filter(currency=cls.DEFAULT_CURRENCY)
        paid_orders = usd_orders.filter(payment_status=Order.PaymentStatus.PAID)

        status_counts = orders.aggregate(
            order_count=Count("id"),
            paid_order_count=Count(
                "id",
                filter=Q(
                    payment_status=Order.PaymentStatus.PAID,
                    currency=cls.DEFAULT_CURRENCY,
                ),
            ),
            refunded_order_count=Count(
                "id",
                filter=Q(payment_status=Order.PaymentStatus.REFUNDED),
            ),
            cancelled_order_count=Count(
                "id",
                filter=Q(payment_status=Order.PaymentStatus.CANCELLED),
            ),
            pending_order_count=Count(
                "id",
                filter=Q(payment_status=Order.PaymentStatus.PENDING),
            ),
            revenue=Coalesce(
                Sum(
                    "total_amount",
                    filter=Q(
                        payment_status=Order.PaymentStatus.PAID,
                        currency=cls.DEFAULT_CURRENCY,
                    ),
                ),
                Value(Decimal("0.00")),
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
        )

        revenue = _money(status_counts["revenue"])
        paid_count = status_counts["paid_order_count"]
        average_order_value = (
            _money(revenue / paid_count) if paid_count > 0 else Decimal("0.00")
        )

        revenue_by_period = []
        for row in (
            paid_orders.annotate(period=TruncMonth("created_at"))
            .values("period")
            .annotate(
                order_count=Count("id"),
                revenue=Coalesce(
                    Sum("total_amount"),
                    Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .order_by("period")
        ):
            period = row["period"]
            if period is None:
                continue
            if isinstance(period, datetime):
                period_label = timezone.localtime(period).strftime("%Y-%m")
            else:
                period_label = str(period)[:7]
            revenue_by_period.append(
                {
                    "period": period_label,
                    "order_count": row["order_count"],
                    "revenue": _money(row["revenue"]),
                }
            )

        top_products = cls._top_catalog_items(
            start=start,
            end=end,
            product_type=OrderItem.ProductType.PRODUCT,
        )
        top_plugins = cls._top_catalog_items(
            start=start,
            end=end,
            product_type=OrderItem.ProductType.PLUGIN,
        )
        gateway_breakdown = cls._gateway_breakdown(start=start, end=end)

        return {
            "filters": {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
            },
            "currency": cls.DEFAULT_CURRENCY,
            "summary": {
                "order_count": status_counts["order_count"],
                "excluded_currency_order_count": orders.exclude(
                    currency=cls.DEFAULT_CURRENCY
                ).count(),
                "paid_order_count": paid_count,
                "pending_order_count": status_counts["pending_order_count"],
                "refunded_order_count": status_counts["refunded_order_count"],
                "cancelled_order_count": status_counts["cancelled_order_count"],
                "revenue": revenue,
                "average_order_value": average_order_value,
            },
            "revenue_by_period": revenue_by_period,
            "top_products": top_products,
            "top_plugins": top_plugins,
            # Stable shape for post–Feature 15 gateway reporting (Stripe / PayPal / Razorpay).
            "gateway_breakdown": gateway_breakdown,
        }

    @classmethod
    def _top_catalog_items(
        cls,
        *,
        start: date,
        end: date,
        product_type: str,
    ) -> list[dict[str, Any]]:
        line_total = ExpressionWrapper(
            F("purchase_price") * F("quantity"),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        )
        # Rank by parent order created_at (order date), not line created_at.
        queryset = OrderItem.objects.filter(
            product_type=product_type,
            order__payment_status=Order.PaymentStatus.PAID,
            order__currency=cls.DEFAULT_CURRENCY,
            order__created_at__date__gte=start,
            order__created_at__date__lte=end,
        )

        rows = (
            queryset.values("product_id")
            .annotate(
                title=Max("title"),
                slug=Max("slug"),
                quantity_sold=Coalesce(Sum("quantity"), 0),
                revenue=Coalesce(
                    Sum(line_total),
                    Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                order_count=Count("order_id", distinct=True),
            )
            .order_by("-quantity_sold", "-revenue")[: cls.TOP_LIMIT]
        )

        return [
            {
                "product_id": row["product_id"],
                "product_type": product_type,
                "title": row["title"] or "Untitled",
                "slug": row["slug"] or "",
                "quantity_sold": row["quantity_sold"],
                "order_count": row["order_count"],
                "revenue": _money(row["revenue"]),
            }
            for row in rows
        ]

    @classmethod
    def _gateway_breakdown(cls, *, start: date, end: date) -> list[dict[str, Any]]:
        """Aggregate succeeded payments by gateway for the date range.

        Present now so clients can bind to a stable key; expands as more gateways ship.
        """
        payments = Payment.objects.filter(
            status=Payment.Status.SUCCEEDED,
            currency=cls.DEFAULT_CURRENCY,
            created_at__date__gte=start,
            created_at__date__lte=end,
        )
        rows = (
            payments.values("gateway")
            .annotate(
                payment_count=Count("id"),
                revenue=Coalesce(
                    Sum("amount"),
                    Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .order_by("-revenue", "gateway")
        )
        return [
            {
                "gateway": row["gateway"] or "unknown",
                "payment_count": row["payment_count"],
                "revenue": _money(row["revenue"]),
            }
            for row in rows
        ]
