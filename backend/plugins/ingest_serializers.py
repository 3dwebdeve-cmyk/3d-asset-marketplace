"""Request shapes for the plugin uploader exe (API key routes)."""

from __future__ import annotations

import json

from rest_framework import serializers

MANIFEST_MAX_BYTES = 20_000
MAX_ITEMS_PER_BATCH = 200


class PluginImportMediaSerializer(serializers.Serializer):
    thumbnail_key = serializers.CharField(max_length=512)
    package_key = serializers.CharField(max_length=512)
    package_file_size = serializers.IntegerField(required=False, default=0, min_value=0)


class PluginImportItemSerializer(serializers.Serializer):
    plugin_id = serializers.CharField(max_length=16, trim_whitespace=True)
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    category_code = serializers.CharField(max_length=3, trim_whitespace=True)
    description = serializers.CharField(max_length=20_000, trim_whitespace=True)
    manifest = serializers.DictField(required=False, default=dict)
    media = PluginImportMediaSerializer()

    def validate_manifest(self, value: dict) -> dict:
        if len(json.dumps(value, default=str)) > MANIFEST_MAX_BYTES:
            raise serializers.ValidationError("The manifest is too large.")
        return value


class PluginImportEnvelopeSerializer(serializers.Serializer):
    import_batch_id = serializers.CharField(max_length=64, trim_whitespace=True)
    import_source = serializers.CharField(
        required=False,
        allow_blank=True,
        default="plugin-uploader",
        max_length=64,
        trim_whitespace=True,
    )
    items = PluginImportItemSerializer(many=True, allow_empty=False)

    def validate_import_batch_id(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("import_batch_id is required.")
        return normalized

    def validate_items(self, value: list) -> list:
        if len(value) > MAX_ITEMS_PER_BATCH:
            raise serializers.ValidationError(
                f"A batch may contain at most {MAX_ITEMS_PER_BATCH} items."
            )
        return value
