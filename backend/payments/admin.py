from django.contrib import admin

from payments.models import Payment, StripeWebhookEvent


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "order",
        "gateway",
        "amount",
        "currency",
        "status",
        "stripe_checkout_session_id",
        "created_at",
    )
    list_filter = ("status", "gateway", "currency")
    search_fields = (
        "order__invoice_number",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
    )
    raw_id_fields = ("order",)
    readonly_fields = (
        "id",
        "order",
        "gateway",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
        "amount",
        "currency",
        # Payment status and refunded totals come only from Stripe events.
        "status",
        "refunded_amount",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request) -> bool:
        return False


@admin.register(StripeWebhookEvent)
class StripeWebhookEventAdmin(admin.ModelAdmin):
    list_display = ("stripe_event_id", "event_type", "received_at")
    list_filter = ("event_type",)
    search_fields = ("stripe_event_id",)
    readonly_fields = ("id", "stripe_event_id", "event_type", "received_at")

    def has_add_permission(self, request) -> bool:
        return False
