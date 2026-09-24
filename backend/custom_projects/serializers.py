from rest_framework import serializers

from custom_projects.models import (
    CustomProject,
    ProjectDelivery,
    ProjectFile,
    ProjectMessage,
    ProjectMessageAttachment,
    ProjectQuotation,
)


class ProjectQuotationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectQuotation
        fields = (
            "id",
            "amount",
            "currency",
            "estimated_delivery",
            "notes",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class ProjectFileSerializer(serializers.ModelSerializer):
    uploaded_by_email = serializers.EmailField(source="uploaded_by.email", read_only=True)
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ProjectFile
        fields = (
            "id",
            "file_type",
            "file_name",
            "download_url",
            "file_size",
            "uploaded_by_email",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_download_url(self, obj: ProjectFile) -> str:
        request = self.context.get("request")
        path = (
            f"/api/v1/admin/custom-projects/{obj.project_id}/files/{obj.id}/download/"
        )
        if request is not None:
            return request.build_absolute_uri(path)
        return path


class ProjectFilePublicSerializer(serializers.ModelSerializer):
    """Customer-facing file metadata without storage URL until entitlement exists."""

    class Meta:
        model = ProjectFile
        fields = (
            "id",
            "file_type",
            "file_name",
            "file_size",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CustomProjectCustomerBriefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()


class AssignedDesignerPublicSerializer(serializers.Serializer):
    """Customer-visible designer identity without admin email."""

    id = serializers.UUIDField()
    full_name = serializers.CharField()


class CustomProjectListSerializer(serializers.ModelSerializer):
    customer = CustomProjectCustomerBriefSerializer(read_only=True)
    assigned_designer = CustomProjectCustomerBriefSerializer(read_only=True, allow_null=True)
    quotation_amount = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField(read_only=True)
    has_unread = serializers.SerializerMethodField()

    class Meta:
        model = CustomProject
        fields = (
            "id",
            "title",
            "category",
            "status",
            "payment_status",
            "estimated_budget",
            "currency",
            "deadline",
            "customer",
            "assigned_designer",
            "quotation_amount",
            "unread_count",
            "has_unread",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_quotation_amount(self, obj: CustomProject) -> str | None:
        quotation = getattr(obj, "quotation", None)
        if quotation is None:
            return None
        return f"{quotation.amount:.2f}"

    def get_has_unread(self, obj: CustomProject) -> bool:
        return int(getattr(obj, "unread_count", 0) or 0) > 0


class CustomProjectCustomerListSerializer(serializers.ModelSerializer):
    assigned_designer = AssignedDesignerPublicSerializer(read_only=True, allow_null=True)
    quotation_amount = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField(read_only=True)
    has_unread = serializers.SerializerMethodField()

    class Meta:
        model = CustomProject
        fields = (
            "id",
            "title",
            "category",
            "status",
            "payment_status",
            "estimated_budget",
            "currency",
            "deadline",
            "assigned_designer",
            "quotation_amount",
            "unread_count",
            "has_unread",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_quotation_amount(self, obj: CustomProject) -> str | None:
        quotation = getattr(obj, "quotation", None)
        if quotation is None:
            return None
        return f"{quotation.amount:.2f}"

    def get_has_unread(self, obj: CustomProject) -> bool:
        return int(getattr(obj, "unread_count", 0) or 0) > 0


class CustomProjectDetailSerializer(serializers.ModelSerializer):
    customer = CustomProjectCustomerBriefSerializer(read_only=True)
    assigned_designer = CustomProjectCustomerBriefSerializer(read_only=True, allow_null=True)
    quotation = ProjectQuotationSerializer(read_only=True, allow_null=True)
    files = ProjectFileSerializer(many=True, read_only=True)

    class Meta:
        model = CustomProject
        fields = (
            "id",
            "title",
            "description",
            "category",
            "estimated_budget",
            "currency",
            "deadline",
            "status",
            "payment_status",
            "admin_notes",
            "customer",
            "assigned_designer",
            "quotation",
            "files",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CustomProjectCustomerDetailSerializer(serializers.ModelSerializer):
    assigned_designer = AssignedDesignerPublicSerializer(read_only=True, allow_null=True)
    quotation = ProjectQuotationSerializer(read_only=True, allow_null=True)
    files = ProjectFilePublicSerializer(many=True, read_only=True)

    class Meta:
        model = CustomProject
        fields = (
            "id",
            "title",
            "description",
            "category",
            "estimated_budget",
            "currency",
            "deadline",
            "status",
            "payment_status",
            "assigned_designer",
            "quotation",
            "files",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CustomProjectCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, min_length=3)
    description = serializers.CharField(min_length=10)
    category = serializers.CharField(max_length=120, required=False, allow_blank=True)
    estimated_budget = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=0,
    )
    currency = serializers.CharField(max_length=3, required=False, default="USD")
    deadline = serializers.DateField(required=False, allow_null=True)


class AdminCustomProjectCreateSerializer(CustomProjectCreateSerializer):
    customer_id = serializers.UUIDField()


class CustomProjectUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, min_length=3, required=False)
    description = serializers.CharField(min_length=10, required=False)
    category = serializers.CharField(max_length=120, required=False, allow_blank=True)
    estimated_budget = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=0,
    )
    currency = serializers.CharField(max_length=3, required=False)
    deadline = serializers.DateField(required=False, allow_null=True)
    status = serializers.ChoiceField(
        choices=CustomProject.Status.choices,
        required=False,
    )
    assigned_designer_id = serializers.UUIDField(required=False, allow_null=True)
    payment_status = serializers.ChoiceField(
        choices=CustomProject.PaymentStatus.choices,
        required=False,
    )
    admin_notes = serializers.CharField(required=False, allow_blank=True)


class ProjectQuotationUpsertSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    currency = serializers.CharField(max_length=3, required=False, default="USD")
    estimated_delivery = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(
        choices=ProjectQuotation.Status.choices,
        required=False,
        default=ProjectQuotation.Status.PENDING,
    )


class ProjectFileUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    file_type = serializers.ChoiceField(
        choices=ProjectFile.FileType.choices,
        default=ProjectFile.FileType.OTHER,
    )


class ProjectDeliverySerializer(serializers.ModelSerializer):
    """Delivery metadata with authenticated download URL. Never exposes storage_path."""

    uploaded_by_email = serializers.EmailField(
        source="uploaded_by.email",
        read_only=True,
    )
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ProjectDelivery
        fields = (
            "id",
            "project_id",
            "file_name",
            "file_size",
            "version",
            "notes",
            "uploaded_by_email",
            "download_url",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_download_url(self, obj: ProjectDelivery) -> str:
        request = self.context.get("request")
        scope = self.context.get("delivery_download_scope", "admin")
        project_id = self.context.get("project_id") or obj.project_id
        if scope == "customer":
            path = (
                f"/api/v1/custom-projects/{project_id}/deliveries/{obj.id}/download/"
            )
        else:
            path = (
                f"/api/v1/admin/custom-projects/{project_id}/deliveries/"
                f"{obj.id}/download/"
            )
        if request is not None:
            return request.build_absolute_uri(path)
        return path


class ProjectDeliveryUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    version = serializers.IntegerField(required=False, min_value=1)


class ProjectMessageSenderSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()


class ProjectMessageAttachmentSerializer(serializers.ModelSerializer):
    """Message attachment metadata with authenticated download URL (never storage_path)."""

    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMessageAttachment
        fields = (
            "id",
            "file_name",
            "file_size",
            "download_url",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_download_url(self, obj: ProjectMessageAttachment) -> str:
        request = self.context.get("request")
        scope = self.context.get("attachment_download_scope", "customer")
        project_id = self.context.get("project_id") or obj.message.project_id
        if scope == "admin":
            path = (
                f"/api/v1/admin/custom-projects/{project_id}/messages/"
                f"{obj.message_id}/attachments/{obj.id}/download/"
            )
        else:
            path = (
                f"/api/v1/custom-projects/{project_id}/messages/"
                f"{obj.message_id}/attachments/{obj.id}/download/"
            )
        if request is not None:
            return request.build_absolute_uri(path)
        return path


class ProjectMessageSerializer(serializers.ModelSerializer):
    sender = ProjectMessageSenderSerializer(read_only=True)
    attachments = serializers.SerializerMethodField()

    class Meta:
        model = ProjectMessage
        fields = (
            "id",
            "project_id",
            "body",
            "sender",
            "attachments",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_attachments(self, obj: ProjectMessage) -> list:
        return ProjectMessageAttachmentSerializer(
            obj.attachments.all(),
            many=True,
            context={
                **self.context,
                "project_id": obj.project_id,
            },
        ).data


class ProjectMessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(
        max_length=ProjectMessage.BODY_MAX_LENGTH,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        default="",
    )
    file = serializers.FileField(required=False)

    def validate(self, attrs: dict) -> dict:
        body = (attrs.get("body") or "").strip()
        uploaded = attrs.get("file")
        if not body and uploaded is None:
            raise serializers.ValidationError(
                {"body": ["Provide a message body or an attachment."]}
            )
        attrs["body"] = body
        return attrs


class ProjectMessageReadStateSerializer(serializers.Serializer):
    project_id = serializers.UUIDField()
    last_read_at = serializers.DateTimeField()
    unread_count = serializers.IntegerField()
