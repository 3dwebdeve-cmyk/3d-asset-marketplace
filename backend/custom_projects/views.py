from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import (
    AdminCustomProjectWriteRateThrottle,
    CustomProjectWriteRateThrottle,
)
from custom_projects.models import CustomProject, ProjectFile
from custom_projects.pagination import CustomProjectPagination
from custom_projects.serializers import (
    AdminCustomProjectCreateSerializer,
    CustomProjectCreateSerializer,
    CustomProjectCustomerDetailSerializer,
    CustomProjectCustomerListSerializer,
    CustomProjectDetailSerializer,
    CustomProjectListSerializer,
    CustomProjectUpdateSerializer,
    ProjectFilePublicSerializer,
    ProjectFileUploadSerializer,
    ProjectMessageCreateSerializer,
    ProjectMessageSerializer,
    ProjectQuotationSerializer,
    ProjectQuotationUpsertSerializer,
)
from custom_projects.services import (
    CustomProjectCreateData,
    CustomProjectError,
    CustomProjectService,
    CustomProjectUpdateData,
    ProjectQuotationData,
)
from custom_projects.upload_rules import validate_project_file_upload
from config.media import open_stored_file


def _error_response(exc: CustomProjectError) -> Response:
    if exc.field:
        return Response(
            {exc.field: [exc.message]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"detail": exc.message, "code": "custom_project_error"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _parse_uuid(value: str | None, field: str) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value.strip())
    except ValueError as exc:
        raise ValidationError({field: [f"Invalid {field}."]}) from exc


def _parse_choice(value: str | None, field: str, allowed: set[str]) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValidationError({field: [f"Invalid {field} filter."]})
    return normalized


class CustomerCustomProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [CustomProjectWriteRateThrottle]
    pagination_class = CustomProjectPagination

    def get(self, request: Request) -> Response:
        queryset = CustomProjectService.list_for_customer(request.user)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            CustomProjectCustomerListSerializer(page, many=True).data
        )

    def post(self, request: Request) -> Response:
        serializer = CustomProjectCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            project = CustomProjectService.create(
                CustomProjectCreateData(
                    customer_id=request.user.id,
                    **serializer.validated_data,
                )
            )
        except CustomProjectError as exc:
            return _error_response(exc)
        detail = CustomProjectService.get_for_customer(project.id, request.user)
        return Response(
            CustomProjectCustomerDetailSerializer(detail).data,
            status=status.HTTP_201_CREATED,
        )


class CustomerCustomProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(CustomProjectCustomerDetailSerializer(project).data)


class CustomerCustomProjectFileUploadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [CustomProjectWriteRateThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        serializer = ProjectFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            validated = validate_project_file_upload(serializer.validated_data["file"])
            project_file = CustomProjectService.add_file(
                project,
                uploaded_by=request.user,
                validated=validated,
                file_type=serializer.validated_data["file_type"],
            )
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
        except CustomProjectError as exc:
            return _error_response(exc)
        return Response(
            ProjectFilePublicSerializer(project_file).data,
            status=status.HTTP_201_CREATED,
        )


class AdminCustomProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCustomProjectWriteRateThrottle]
    pagination_class = CustomProjectPagination

    def get(self, request: Request) -> Response:
        queryset = CustomProjectService.list_admin(
            search=request.query_params.get("search") or None,
            status=_parse_choice(
                request.query_params.get("status"),
                "status",
                set(CustomProject.Status.values),
            ),
            payment_status=_parse_choice(
                request.query_params.get("payment_status"),
                "payment_status",
                set(CustomProject.PaymentStatus.values),
            ),
            customer_id=_parse_uuid(
                request.query_params.get("customer_id"),
                "customer_id",
            ),
            ordering=request.query_params.get("ordering") or "-created_at",
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            CustomProjectListSerializer(page, many=True).data
        )

    def post(self, request: Request) -> Response:
        serializer = AdminCustomProjectCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        customer_id = payload.pop("customer_id")
        try:
            project = CustomProjectService.create(
                CustomProjectCreateData(customer_id=customer_id, **payload)
            )
        except CustomProjectError as exc:
            return _error_response(exc)
        log_admin_action(
            action="custom_project_create",
            actor_id=str(request.user.id),
            target_id=str(project.id),
        )
        detail = CustomProjectService.get_for_admin(project.id)
        return Response(
            CustomProjectDetailSerializer(detail, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminCustomProjectDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCustomProjectWriteRateThrottle]

    def get(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(
            CustomProjectDetailSerializer(project, context={"request": request}).data
        )

    def patch(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        serializer = CustomProjectUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        update = CustomProjectUpdateData(
            title=data.get("title"),
            description=data.get("description"),
            category=data.get("category"),
            estimated_budget=data.get("estimated_budget"),
            clear_estimated_budget=(
                "estimated_budget" in data and data.get("estimated_budget") is None
            ),
            currency=data.get("currency"),
            deadline=data.get("deadline"),
            clear_deadline=("deadline" in data and data.get("deadline") is None),
            status=data.get("status"),
            assigned_designer_id=data.get("assigned_designer_id"),
            clear_assigned_designer=(
                "assigned_designer_id" in data
                and data.get("assigned_designer_id") is None
            ),
            payment_status=data.get("payment_status"),
            admin_notes=data.get("admin_notes"),
        )
        try:
            updated = CustomProjectService.update_admin(project, update)
        except CustomProjectError as exc:
            return _error_response(exc)
        log_admin_action(
            action="custom_project_update",
            actor_id=str(request.user.id),
            target_id=str(project_id),
        )
        return Response(
            CustomProjectDetailSerializer(updated, context={"request": request}).data
        )


class AdminCustomProjectFileDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request, project_id: UUID, file_id: UUID):
        try:
            CustomProjectService.get_for_admin(project_id)
            project_file = ProjectFile.objects.get(pk=file_id, project_id=project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        except ProjectFile.DoesNotExist as exc:
            raise NotFound(detail="File not found.") from exc
        return open_stored_file(project_file.storage_path)


class AdminCustomProjectQuotationView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCustomProjectWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        serializer = ProjectQuotationUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            quotation = CustomProjectService.upsert_quotation(
                project,
                ProjectQuotationData(**serializer.validated_data),
            )
        except CustomProjectError as exc:
            return _error_response(exc)
        log_admin_action(
            action="custom_project_quotation_upsert",
            actor_id=str(request.user.id),
            target_id=str(project_id),
        )
        detail = CustomProjectService.get_for_admin(project_id)
        return Response(
            {
                "quotation": ProjectQuotationSerializer(quotation).data,
                "project": CustomProjectDetailSerializer(
                    detail, context={"request": request}
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class CustomerCustomProjectMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = CustomProjectPagination

    def get_throttles(self):
        if self.request.method == "POST":
            return [CustomProjectWriteRateThrottle()]
        return []

    def get(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        queryset = CustomProjectService.list_messages(project)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            ProjectMessageSerializer(page, many=True).data
        )

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        serializer = ProjectMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            message = CustomProjectService.create_message(
                project,
                sender=request.user,
                body=serializer.validated_data["body"],
            )
        except CustomProjectError as exc:
            return _error_response(exc)
        return Response(
            ProjectMessageSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )


class AdminCustomProjectMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = CustomProjectPagination

    def get_throttles(self):
        if self.request.method == "POST":
            return [AdminCustomProjectWriteRateThrottle()]
        return []

    def get(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        queryset = CustomProjectService.list_messages(project)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            ProjectMessageSerializer(page, many=True).data
        )

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        serializer = ProjectMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            message = CustomProjectService.create_message(
                project,
                sender=request.user,
                body=serializer.validated_data["body"],
            )
        except CustomProjectError as exc:
            return _error_response(exc)
        log_admin_action(
            action="custom_project_message_create",
            actor_id=str(request.user.id),
            target_id=str(message.id),
        )
        return Response(
            ProjectMessageSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )
