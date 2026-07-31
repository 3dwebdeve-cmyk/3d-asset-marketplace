from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Count, Q

from accounts.models import User
from categories.models import Category
from custom_projects.models import CustomProject
from payments.models import Payment
from plugins.models import Plugin
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
        plugin_counts = Plugin.objects.aggregate(total=Count("id"))
        payment_counts = Payment.objects.aggregate(
            succeeded=Count("id", filter=Q(status=Payment.Status.SUCCEEDED)),
            pending=Count("id", filter=Q(status=Payment.Status.PENDING)),
        )
        project_counts = CustomProject.objects.aggregate(
            pending=Count(
                "id",
                filter=Q(
                    status__in=[
                        CustomProject.Status.SUBMITTED,
                        CustomProject.Status.UNDER_REVIEW,
                        CustomProject.Status.QUOTED,
                    ]
                ),
            ),
            live=Count(
                "id",
                filter=Q(
                    status__in=[
                        CustomProject.Status.APPROVED,
                        CustomProject.Status.IN_PROGRESS,
                        CustomProject.Status.DELIVERED,
                    ]
                ),
            ),
            completed=Count(
                "id",
                filter=Q(status=CustomProject.Status.COMPLETED),
            ),
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
            "projects": {
                "pending": project_counts["pending"],
                "live": project_counts["live"],
                "completed": project_counts["completed"],
            },
            "sales": {
                "monthly_revenue": Decimal("0.00"),
                "monthly_orders": 0,
                "currency": cls.DEFAULT_CURRENCY,
            },
            "payments": {
                "succeeded": payment_counts["succeeded"],
                "pending": payment_counts["pending"],
            },
            "category_breakdown": category_breakdown,
        }
