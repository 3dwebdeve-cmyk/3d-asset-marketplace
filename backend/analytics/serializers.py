from rest_framework import serializers


class AdminDashboardUsersStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    active = serializers.IntegerField()


class AdminDashboardProductsStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    published = serializers.IntegerField()
    draft = serializers.IntegerField()
    archived = serializers.IntegerField()


class AdminDashboardCategoriesStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    live = serializers.IntegerField()


class AdminDashboardPluginsStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()


class AdminDashboardProjectsStatsSerializer(serializers.Serializer):
    pending = serializers.IntegerField()
    live = serializers.IntegerField()
    completed = serializers.IntegerField()


class AdminDashboardSalesStatsSerializer(serializers.Serializer):
    monthly_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    monthly_orders = serializers.IntegerField()
    currency = serializers.CharField(max_length=3)


class AdminDashboardCategoryBreakdownSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()
    is_active = serializers.BooleanField()
    product_count = serializers.IntegerField()
    published_product_count = serializers.IntegerField()


class AdminDashboardStatsSerializer(serializers.Serializer):
    users = AdminDashboardUsersStatsSerializer()
    products = AdminDashboardProductsStatsSerializer()
    categories = AdminDashboardCategoriesStatsSerializer()
    plugins = AdminDashboardPluginsStatsSerializer()
    projects = AdminDashboardProjectsStatsSerializer()
    sales = AdminDashboardSalesStatsSerializer()
    category_breakdown = AdminDashboardCategoryBreakdownSerializer(many=True)

    @classmethod
    def from_service(cls, stats: dict) -> "AdminDashboardStatsSerializer":
        breakdown = [
            {
                "id": item.id,
                "name": item.name,
                "slug": item.slug,
                "is_active": item.is_active,
                "product_count": item.product_count,
                "published_product_count": item.published_product_count,
            }
            for item in stats["category_breakdown"]
        ]
        payload = {
            **{key: value for key, value in stats.items() if key != "category_breakdown"},
            "category_breakdown": breakdown,
        }
        serializer = cls(data=payload)
        serializer.is_valid(raise_exception=True)
        return serializer
