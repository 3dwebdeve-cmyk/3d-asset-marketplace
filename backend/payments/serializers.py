from rest_framework import serializers

from payments.models import Payment


class AdminPaymentOrderSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    invoice_number = serializers.CharField()
    order_status = serializers.CharField()
    payment_status = serializers.CharField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField()


class AdminPaymentListSerializer(serializers.ModelSerializer):
    customer_email = serializers.EmailField(source="order.user.email", read_only=True)
    invoice_number = serializers.CharField(source="order.invoice_number", read_only=True)
    order_id = serializers.UUIDField(source="order.id", read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id",
            "created_at",
            "updated_at",
            "customer_email",
            "invoice_number",
            "order_id",
            "amount",
            "currency",
            "status",
            "gateway",
            "stripe_checkout_session_id",
            "stripe_payment_intent_id",
        )
        read_only_fields = fields


class AdminPaymentDetailSerializer(serializers.ModelSerializer):
    customer_email = serializers.EmailField(source="order.user.email", read_only=True)
    customer_full_name = serializers.CharField(
        source="order.user.full_name",
        read_only=True,
    )
    order = AdminPaymentOrderSummarySerializer(read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id",
            "created_at",
            "updated_at",
            "customer_email",
            "customer_full_name",
            "amount",
            "currency",
            "status",
            "gateway",
            "stripe_checkout_session_id",
            "stripe_payment_intent_id",
            "order",
        )
        read_only_fields = fields
