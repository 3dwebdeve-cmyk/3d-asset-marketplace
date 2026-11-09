"""Small, private search results for the administrator header."""

from django.db.models import Q
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdministrator
from orders.models import Order
from plugins.models import Plugin
from products.models import Product


class SearchParamsSerializer(serializers.Serializer):
    q = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class AdminSearchView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request):
        params = SearchParamsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        query = params.validated_data["q"]
        results = {"products": [], "plugins": [], "users": [], "orders": []}
        if len(query) >= 2:
            # Filter and limit in SQL; never send complete customer/order records.
            results["products"] = [
                {"id": str(row.id), "label": row.name, "detail": row.sku or row.status}
                for row in Product.objects.filter(Q(name__icontains=query) | Q(sku__icontains=query))
                .only("id", "name", "sku", "status").order_by("name", "id")[:5]
            ]
            results["plugins"] = [
                {"id": str(row.id), "label": row.name, "detail": row.status}
                for row in Plugin.objects.filter(name__icontains=query)
                .only("id", "name", "status").order_by("name", "id")[:5]
            ]
            results["users"] = [
                {"id": str(row.id), "label": row.full_name or row.email, "detail": row.email}
                for row in User.objects.filter(Q(full_name__icontains=query) | Q(email__icontains=query))
                .only("id", "full_name", "email").order_by("full_name", "id")[:5]
            ]
            results["orders"] = [
                {"id": str(row.id), "label": row.invoice_number, "detail": row.user.email}
                for row in Order.objects.filter(Q(invoice_number__icontains=query) | Q(user__email__icontains=query))
                .select_related("user").only("id", "invoice_number", "user__email")
                .order_by("-created_at", "id")[:5]
            ]
        response = Response(results)
        response["Cache-Control"] = "no-store"
        return response
