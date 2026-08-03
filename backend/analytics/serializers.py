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


class AdminDashboardPaymentsStatsSerializer(serializers.Serializer):
    succeeded = serializers.IntegerField()
    pending = serializers.IntegerField()


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
    payments = AdminDashboardPaymentsStatsSerializer()
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


class AdminAnalyticsFiltersSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class AdminAnalyticsSummarySerializer(serializers.Serializer):
    order_count = serializers.IntegerField()
    paid_order_count = serializers.IntegerField()
    pending_order_count = serializers.IntegerField()
    refunded_order_count = serializers.IntegerField()
    cancelled_order_count = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    average_order_value = serializers.DecimalField(max_digits=12, decimal_places=2)


class AdminAnalyticsPeriodSerializer(serializers.Serializer):
    period = serializers.CharField()
    order_count = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2)


class AdminAnalyticsTopItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    product_type = serializers.CharField()
    title = serializers.CharField()
    slug = serializers.CharField(allow_blank=True)
    quantity_sold = serializers.IntegerField()
    order_count = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2)


class AdminAnalyticsGatewaySerializer(serializers.Serializer):
    gateway = serializers.CharField()
    payment_count = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=12, decimal_places=2)


class AdminAnalyticsSerializer(serializers.Serializer):
    filters = AdminAnalyticsFiltersSerializer()
    currency = serializers.CharField(max_length=3)
    summary = AdminAnalyticsSummarySerializer()
    revenue_by_period = AdminAnalyticsPeriodSerializer(many=True)
    top_products = AdminAnalyticsTopItemSerializer(many=True)
    top_plugins = AdminAnalyticsTopItemSerializer(many=True)
    gateway_breakdown = AdminAnalyticsGatewaySerializer(many=True)

    @classmethod
    def from_service(cls, payload: dict) -> "AdminAnalyticsSerializer":
        serializer = cls(data=payload)
        serializer.is_valid(raise_exception=True)
        return serializer
