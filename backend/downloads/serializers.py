from rest_framework import serializers

from downloads.models import DownloadHistory
from downloads.services import DownloadService


class DownloadFileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    # The package this zip is ("" for a plugin file or a model file without a kind).
    package_kind = serializers.CharField(allow_blank=True)
    package_label = serializers.CharField(allow_blank=True)
    file_name = serializers.CharField()
    file_format = serializers.CharField()
    file_size = serializers.IntegerField()
    version = serializers.CharField()
    download_url = serializers.SerializerMethodField()
    last_downloaded_at = serializers.DateTimeField(required=False, allow_null=True)
    # Downloads left on this file over the user's paid lines (0 = used up: buy it again).
    downloads_left = serializers.IntegerField(min_value=0)

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
    # The packages of a model the user owns, in PACKAGE_ORDER ([] for a plugin).
    package_kinds = serializers.ListField(child=serializers.CharField())
    # False once every download is used: the item can be bought again.
    has_downloads_left = serializers.BooleanField()
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
    package_label = serializers.SerializerMethodField()

    def get_package_label(self, obj: DownloadHistory) -> str:
        """The package of the file downloaded (from the view's one lookup per page)."""
        return self.context.get("package_labels", {}).get(obj.file_id, "")

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
            "package_label",
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
        if obj.get("line_id"):
            # Count the download against this order's line, not another purchase.
            path = f"{path}?line={obj['line_id']}"
        if request is not None:
            return request.build_absolute_uri(path)
        return path


class SignedDownloadSerializer(serializers.Serializer):
    download_url = serializers.CharField()
    expires_in = serializers.IntegerField(min_value=1)
    file_name = serializers.CharField()
