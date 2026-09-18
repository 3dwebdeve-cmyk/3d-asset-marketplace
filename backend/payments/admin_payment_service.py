"""Admin payment list/detail queries."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from django.db.models import Q, QuerySet

from payments.models import Payment
from payments.payment_common import (
    PAYMENT_ORDERING_FIELDS,
    AdminPaymentError,
    normalize_status_filter,
    parse_day_bound,
)


class AdminPaymentService:
    @classmethod
    def list_admin(
        cls,
        *,
        status: str | None = None,
        search: str | None = None,
        created_after: str | None = None,
        created_before: str | None = None,
        ordering: str = "-created_at",
    ) -> QuerySet[Payment]:
        queryset = Payment.objects.select_related("order", "order__user")

        if status:
            queryset = queryset.filter(status=normalize_status_filter(status))

        if search:
            term = search.strip()
            if term:
                queryset = queryset.filter(
                    Q(order__invoice_number__icontains=term)
                    | Q(order__user__email__icontains=term)
                )

        after = parse_day_bound(created_after, end_of_day=False)
        before = parse_day_bound(created_before, end_of_day=True)
        if isinstance(after, date) and not isinstance(after, datetime):
            queryset = queryset.filter(created_at__date__gte=after)
        elif after is not None:
            queryset = queryset.filter(created_at__gte=after)
        if isinstance(before, date) and not isinstance(before, datetime):
            queryset = queryset.filter(created_at__date__lte=before)
        elif before is not None:
            queryset = queryset.filter(created_at__lte=before)

        order_by = ordering if ordering in PAYMENT_ORDERING_FIELDS else "-created_at"
        return queryset.order_by(order_by)

    @classmethod
    def get(cls, payment_id: UUID) -> Payment:
        try:
            return Payment.objects.select_related("order", "order__user").get(pk=payment_id)
        except Payment.DoesNotExist as exc:
            raise AdminPaymentError("Payment not found.") from exc
