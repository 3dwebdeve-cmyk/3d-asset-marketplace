"""Request shapes for the plugin review queue (admin only)."""

from __future__ import annotations

from rest_framework import serializers


class PluginApproveSerializer(serializers.Serializer):
    """The reviewer sets the price; 0.00 means free."""

    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    currency = serializers.CharField(required=False, allow_blank=True, max_length=3, default="")
    discount_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True, default=None
    )
    qa_notes = serializers.CharField(required=False, allow_blank=True, max_length=5000, default=None)


class PluginRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(trim_whitespace=True, allow_blank=False, max_length=2000)
    qa_notes = serializers.CharField(required=False, allow_blank=True, max_length=5000, default=None)
