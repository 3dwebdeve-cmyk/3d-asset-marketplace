from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Count, Q

from accounts.models import User
from categories.models import Category
from products.models import Product


@dataclass(frozen=True)
class CategoryBreakdownItem:
    id: UUID
    name: str
    slug: str
    is_active: bool
    product_count: int
    published_product_count: int


class DashboardStatsService:
    DEFAULT_CURRENCY = "USD"

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
                "total": 0,
            },
            "projects": {
                "pending": 0,
                "live": 0,
                "completed": 0,
            },
            "sales": {
                "monthly_revenue": Decimal("0.00"),
                "monthly_orders": 0,
                "currency": cls.DEFAULT_CURRENCY,
            },
            "category_breakdown": category_breakdown,
        }
