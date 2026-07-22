from rest_framework import serializers

from custom_projects.models import CustomProject, ProjectFile, ProjectQuotation


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

    class Meta:
        model = ProjectFile
        fields = (
            "id",
            "file_type",
            "file_name",
            "storage_path",
            "file_size",
            "uploaded_by_email",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


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


class CustomProjectListSerializer(serializers.ModelSerializer):
    customer = CustomProjectCustomerBriefSerializer(read_only=True)
    assigned_designer = CustomProjectCustomerBriefSerializer(read_only=True, allow_null=True)
    quotation_amount = serializers.SerializerMethodField()

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
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_quotation_amount(self, obj: CustomProject) -> str | None:
        quotation = getattr(obj, "quotation", None)
        if quotation is None:
            return None
        return f"{quotation.amount:.2f}"


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
    assigned_designer = CustomProjectCustomerBriefSerializer(read_only=True, allow_null=True)
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
