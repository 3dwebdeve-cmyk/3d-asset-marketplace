from rest_framework import serializers

from downloads.models import DownloadHistory
from downloads.services import DownloadService


class DownloadFileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    file_name = serializers.CharField()
    file_format = serializers.CharField()
    file_size = serializers.IntegerField()
    version = serializers.CharField()
    download_url = serializers.SerializerMethodField()
    last_downloaded_at = serializers.DateTimeField(required=False, allow_null=True)

    def get_download_url(self, obj: dict) -> str:
        request = self.context.get("request")
        path = obj.get("download_url") or DownloadService.build_download_path(
            obj["product_type"],
            obj["product_id"],
            obj["id"],
        )
        if request is not None:
            return request.build_absolute_uri(path)
        return path


class DownloadEntitlementSerializer(serializers.Serializer):
    product_type = serializers.CharField()
    product_id = serializers.UUIDField()
    title = serializers.CharField()
    slug = serializers.CharField()
    files = serializers.SerializerMethodField()

    def get_files(self, obj: dict) -> list:
        request = self.context.get("request")
        files = []
        for file_row in obj.get("files", []):
            payload = {
                **file_row,
                "product_type": obj["product_type"],
                "product_id": obj["product_id"],
            }
            files.append(
                DownloadFileSerializer(payload, context={"request": request}).data
            )
        return files


class DownloadHistorySerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(source="user.full_name", read_only=True)
    invoice_number = serializers.CharField(
        source="order.invoice_number",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = DownloadHistory
        fields = (
            "id",
            "user_email",
            "user_full_name",
            "product_type",
            "product_id",
            "file_id",
            "file_name",
            "invoice_number",
            "downloaded_at",
        )
        read_only_fields = fields


class OrderItemDownloadFileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    file_name = serializers.CharField()
    file_format = serializers.CharField()
    file_size = serializers.IntegerField()
    version = serializers.CharField()
    download_url = serializers.SerializerMethodField()

    def get_download_url(self, obj: dict) -> str:
        request = self.context.get("request")
        path = DownloadService.build_download_path(
            obj["product_type"],
            obj["product_id"],
            obj["id"],
        )
        if request is not None:
            return request.build_absolute_uri(path)
        return path


class SignedDownloadSerializer(serializers.Serializer):
    download_url = serializers.CharField()
    expires_in = serializers.IntegerField(min_value=1)
    file_name = serializers.CharField()
