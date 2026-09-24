from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator, IsEmailVerified
from accounts.security_log import log_admin_action
from accounts.throttles import (
    DownloadRateThrottle,
    PaymentCheckoutRateThrottle,
)
from config.api_helpers import domain_error_response, parse_choice, parse_uuid
from config.idempotency import (
    build_cache_key,
    get_or_set,
    idempotency_key_from_request,
)
from config.media import PrivateFileNotFound, resolve_private_download
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
    ProjectDeliverySerializer,
    ProjectDeliveryUploadSerializer,
    ProjectFilePublicSerializer,
    ProjectFileUploadSerializer,
    ProjectMessageCreateSerializer,
    ProjectMessageReadStateSerializer,
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
from downloads.serializers import SignedDownloadSerializer
from payments.services import CheckoutError, CheckoutService
from rest_framework.throttling import UserRateThrottle


# Soft-removed portal (routes unmounted); keep local throttle stubs for unused views.
class AdminCustomProjectWriteRateThrottle(UserRateThrottle):
    scope = "user"


class CustomProjectWriteRateThrottle(UserRateThrottle):
    scope = "user"


def _message_serializer_context(request: Request, *, scope: str) -> dict:
    return {
        "request": request,
        "attachment_download_scope": scope,
    }


def _delivery_serializer_context(request: Request, *, scope: str) -> dict:
    return {
        "request": request,
        "delivery_download_scope": scope,
    }


def _private_download_response(storage_path: str, file_name: str) -> FileResponse | Response:
    """After authz: signed R2 JSON when available, else local FileResponse stream."""
    try:
        result = resolve_private_download(storage_path, file_name=file_name)
    except PrivateFileNotFound as exc:
        raise NotFound(detail="File not found.") from exc
    if isinstance(result, dict):
        return Response(SignedDownloadSerializer(result).data)
    return result


def _create_project_message(
    request: Request,
    project: CustomProject,
    *,
    scope: str,
) -> Response:
    serializer = ProjectMessageCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    uploaded = serializer.validated_data.get("file")
    try:
        validated_upload = (
            validate_project_file_upload(uploaded) if uploaded is not None else None
        )
        message = CustomProjectService.create_message(
            project,
            sender=request.user,
            body=serializer.validated_data["body"],
            attachment=validated_upload,
        )
    except DjangoValidationError as exc:
        return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
    except CustomProjectError as exc:
        return _error_response(exc)
    return Response(
        ProjectMessageSerializer(
            message,
            context=_message_serializer_context(request, scope=scope),
        ).data,
        status=status.HTTP_201_CREATED,
    )


def _error_response(exc: CustomProjectError) -> Response:
    return domain_error_response(exc, default_code="custom_project_error")


class CustomerCustomProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsEmailVerified]
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
                ),
                notify_staff_on_create=True,
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


class CustomerCustomProjectQuotationAcceptView(APIView):
    """Customer accepts a pending quotation for their own project."""

    permission_classes = [IsAuthenticated, IsEmailVerified]
    throttle_classes = [CustomProjectWriteRateThrottle]

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        try:
            CustomProjectService.accept_quotation(project, customer=request.user)
        except CustomProjectError as exc:
            return _error_response(exc)

        detail = CustomProjectService.get_for_customer(project_id, request.user)
        return Response(
            CustomProjectCustomerDetailSerializer(detail).data,
            status=status.HTTP_200_OK,
        )


class CustomerCustomProjectQuotationPayView(APIView):
    """Start Stripe Checkout for an accepted custom-project quotation."""

    permission_classes = [IsAuthenticated, IsEmailVerified]
    throttle_classes = [PaymentCheckoutRateThrottle]

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            # Ownership/404 gate before Stripe session creation.
            CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        accepted_legal = None
        if isinstance(request.data, dict):
            accepted_legal = request.data.get("accepted_legal")

        def _produce() -> tuple[dict, int]:
            try:
                result = CheckoutService.create_quotation_checkout_session(
                    request.user,
                    project_id,
                    accepted_legal=accepted_legal,
                )
            except CheckoutError as exc:
                body: dict = (
                    {exc.field: [exc.message]}
                    if exc.field
                    else {"detail": exc.message, "code": "checkout_error"}
                )
                if exc.code:
                    body["code"] = exc.code
                if exc.extra:
                    body.update(exc.extra)
                return body, status.HTTP_400_BAD_REQUEST
            return result, status.HTTP_201_CREATED

        idem_key = idempotency_key_from_request(request)
        if idem_key:
            body, code = get_or_set(
                build_cache_key(
                    f"quotation_pay:{project_id}",
                    request.user.pk,
                    idem_key,
                ),
                _produce,
            )
            return Response(body, status=code)

        body, code = _produce()
        return Response(body, status=code)


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


class CustomerCustomProjectFileDeleteView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [CustomProjectWriteRateThrottle]

    def delete(self, request: Request, project_id: UUID, file_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        try:
            CustomProjectService.delete_file(
                project,
                file_id=file_id,
                customer=request.user,
            )
        except CustomProjectError as exc:
            return _error_response(exc)

        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminCustomProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCustomProjectWriteRateThrottle]
    pagination_class = CustomProjectPagination

    def get(self, request: Request) -> Response:
        queryset = CustomProjectService.list_admin(
            viewer=request.user,
            search=request.query_params.get("search") or None,
            status=parse_choice(
                request.query_params.get("status"),
                "status",
                set(CustomProject.Status.values),
            ),
            payment_status=parse_choice(
                request.query_params.get("payment_status"),
                "payment_status",
                set(CustomProject.PaymentStatus.values),
            ),
            customer_id=parse_uuid(
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
    throttle_classes = [DownloadRateThrottle]

    def get(self, request: Request, project_id: UUID, file_id: UUID):
        try:
            CustomProjectService.get_for_admin(project_id)
            project_file = ProjectFile.objects.get(pk=file_id, project_id=project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        except ProjectFile.DoesNotExist as exc:
            raise NotFound(detail="File not found.") from exc
        return _private_download_response(project_file.storage_path, project_file.file_name)


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


class AdminCustomProjectQuotationResendEmailView(APIView):
    """Re-send quotation/offer email without mutating quotation fields."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCustomProjectWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        try:
            CustomProjectService.resend_quotation_email(
                project,
                actor_id=str(request.user.id),
            )
        except CustomProjectError as exc:
            return _error_response(exc)

        detail = CustomProjectService.get_for_admin(project_id)
        return Response(
            {
                "detail": "Quotation email queued.",
                "project": CustomProjectDetailSerializer(
                    detail, context={"request": request}
                ).data,
            },
            status=status.HTTP_200_OK,
        )


class AdminCustomProjectDeliveryListCreateView(APIView):
    """Admin list + upload deliverables. Customers cannot upload."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = CustomProjectPagination
    parser_classes = [MultiPartParser, FormParser]

    def get_throttles(self):
        if self.request.method == "POST":
            return [AdminCustomProjectWriteRateThrottle()]
        return []

    def get(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        queryset = CustomProjectService.list_deliveries(project)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            ProjectDeliverySerializer(
                page,
                many=True,
                context=_delivery_serializer_context(request, scope="admin"),
            ).data
        )

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        serializer = ProjectDeliveryUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            validated = validate_project_file_upload(serializer.validated_data["file"])
            delivery = CustomProjectService.create_delivery(
                project,
                uploaded_by=request.user,
                validated=validated,
                notes=serializer.validated_data.get("notes", ""),
                version=serializer.validated_data.get("version"),
            )
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
        except CustomProjectError as exc:
            return _error_response(exc)

        log_admin_action(
            action="custom_project_delivery_upload",
            actor_id=str(request.user.id),
            target_id=str(delivery.id),
        )
        return Response(
            ProjectDeliverySerializer(
                delivery,
                context=_delivery_serializer_context(request, scope="admin"),
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AdminCustomProjectDeliveryDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [DownloadRateThrottle]

    def get(self, request: Request, project_id: UUID, delivery_id: UUID):
        try:
            delivery = CustomProjectService.get_delivery_for_admin(
                project_id=project_id,
                delivery_id=delivery_id,
            )
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        log_admin_action(
            action="custom_project_delivery_download",
            actor_id=str(request.user.id),
            target_id=str(delivery.id),
        )
        return _private_download_response(delivery.storage_path, delivery.file_name)


class CustomerCustomProjectDeliveryListView(APIView):
    """Project owner can list deliverables for their own project."""

    permission_classes = [IsAuthenticated]
    pagination_class = CustomProjectPagination

    def get(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        queryset = CustomProjectService.list_deliveries(project)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            ProjectDeliverySerializer(
                page,
                many=True,
                context=_delivery_serializer_context(request, scope="customer"),
            ).data
        )


class CustomerCustomProjectDeliveryDownloadView(APIView):
    """Project owner can download deliverables for their own project."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [DownloadRateThrottle]

    def get(self, request: Request, project_id: UUID, delivery_id: UUID):
        try:
            delivery = CustomProjectService.get_delivery_for_customer(
                project_id=project_id,
                delivery_id=delivery_id,
                customer=request.user,
            )
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        return _private_download_response(delivery.storage_path, delivery.file_name)


class CustomerCustomProjectMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = CustomProjectPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]

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
            ProjectMessageSerializer(
                page,
                many=True,
                context=_message_serializer_context(request, scope="customer"),
            ).data
        )

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        return _create_project_message(request, project, scope="customer")


class CustomerCustomProjectMessageAttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [DownloadRateThrottle]

    def get(
        self,
        request: Request,
        project_id: UUID,
        message_id: UUID,
        attachment_id: UUID,
    ):
        try:
            attachment = CustomProjectService.get_message_attachment_for_customer(
                project_id=project_id,
                message_id=message_id,
                attachment_id=attachment_id,
                customer=request.user,
            )
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        return _private_download_response(attachment.storage_path, attachment.file_name)


class CustomerCustomProjectMessageMarkReadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [CustomProjectWriteRateThrottle]

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_customer(project_id, request.user)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        state = CustomProjectService.mark_messages_read(project, user=request.user)
        unread_count = CustomProjectService.get_unread_count(project, request.user)
        return Response(
            ProjectMessageReadStateSerializer(
                {
                    "project_id": project.id,
                    "last_read_at": state.last_read_at,
                    "unread_count": unread_count,
                }
            ).data,
            status=status.HTTP_200_OK,
        )


class AdminCustomProjectMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = CustomProjectPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]

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
            ProjectMessageSerializer(
                page,
                many=True,
                context=_message_serializer_context(request, scope="admin"),
            ).data
        )

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        response = _create_project_message(request, project, scope="admin")
        if response.status_code == status.HTTP_201_CREATED:
            log_admin_action(
                action="custom_project_message_create",
                actor_id=str(request.user.id),
                target_id=str(response.data["id"]),
            )
        return response


class AdminCustomProjectMessageAttachmentDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [DownloadRateThrottle]

    def get(
        self,
        request: Request,
        project_id: UUID,
        message_id: UUID,
        attachment_id: UUID,
    ):
        try:
            attachment = CustomProjectService.get_message_attachment_for_admin(
                project_id=project_id,
                message_id=message_id,
                attachment_id=attachment_id,
            )
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc
        return _private_download_response(attachment.storage_path, attachment.file_name)


class AdminCustomProjectMessageMarkReadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCustomProjectWriteRateThrottle]

    def post(self, request: Request, project_id: UUID) -> Response:
        try:
            project = CustomProjectService.get_for_admin(project_id)
        except CustomProjectError as exc:
            raise NotFound(detail=exc.message) from exc

        state = CustomProjectService.mark_messages_read(project, user=request.user)
        unread_count = CustomProjectService.get_unread_count(project, request.user)
        return Response(
            ProjectMessageReadStateSerializer(
                {
                    "project_id": project.id,
                    "last_read_at": state.last_read_at,
                    "unread_count": unread_count,
                }
            ).data,
            status=status.HTTP_200_OK,
        )
