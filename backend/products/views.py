import logging
from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import CatalogApiKeyAuthentication
from accounts.permissions import CatalogIngestIPAllowed, HasCatalogApiKey, IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import (
    AdminProductWriteRateThrottle,
    AdminUploadRateThrottle,
    CartWriteRateThrottle,
    CatalogIngestRateThrottle,
    CatalogSearchRateThrottle,
)
from config.api_helpers import domain_error_response, parse_uuid
from config.http_cache import PublicCatalogCacheMixin
from products.catalog_import import CatalogImportService
from products.models import Product
from products.pagination import ProductPagination
from products.serializers import (
    CatalogImportEnvelopeSerializer,
    ProductAdminSerializer,
    ProductApproveSerializer,
    ProductBulkDeleteSerializer,
    ProductCreateSerializer,
    ProductDetailPublicSerializer,
    ProductFileAdminSerializer,
    ProductFileUploadSerializer,
    ProductImageSerializer,
    ProductImageUploadSerializer,
    ProductListPublicSerializer,
    ProductRejectSerializer,
    ProductUpdateSerializer,
)
from products.services import (
    ProductCreateData,
    ProductError,
    ProductService,
    ProductUpdateData,
)
from orders.services import OrderError, OrderService
from search.services import normalize_query

logger = logging.getLogger(__name__)


def _product_error_response(exc: ProductError) -> Response:
    return domain_error_response(exc, default_code="product_error")


def _parse_status_filter(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    allowed = {choice.value for choice in Product.Status}
    if normalized not in allowed:
        raise ValidationError({"status": ["Invalid status filter."]})
    return normalized


def _parse_bool_filter(value: str | None) -> bool | None:
    """Parse optional boolean query params. Invalid values are ignored."""
    if value is None or value.strip() == "":
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    # Ignore invalid values rather than 400 — keeps browse URLs resilient.
    return None


class ProductListView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]
    pagination_class = ProductPagination

    def get_throttles(self) -> list:
        throttles = super().get_throttles()
        if normalize_query(self.request.query_params.get("search")):
            throttles.append(CatalogSearchRateThrottle())
        return throttles

    def get(self, request: Request) -> Response:
        category_id = parse_uuid(
            request.query_params.get("category_id"),
            "category_id",
        )
        search = request.query_params.get("search") or None
        ordering = request.query_params.get("ordering") or None
        animated = _parse_bool_filter(request.query_params.get("animated"))
        rigged = _parse_bool_filter(request.query_params.get("rigged"))
        pbr_ready = _parse_bool_filter(request.query_params.get("pbr_ready"))
        game_ready = _parse_bool_filter(request.query_params.get("game_ready"))

        paginator = self.pagination_class()
        queryset = ProductService.list_public(
            category_id=category_id,
            search=search,
            ordering=ordering,
            animated=animated,
            rigged=rigged,
            pbr_ready=pbr_ready,
            game_ready=game_ready,
        )
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = ProductListPublicSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class ProductDetailView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, slug: str) -> Response:
        try:
            product = ProductService.get_public_by_slug(slug)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        serializer = ProductDetailPublicSerializer(product)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProductClaimFreeView(APIView):
    """POST /api/v1/products/<slug>/claim-free/ — add a free model to the customer's library.

    No checkout: the model is listed in Dashboard → Downloads right away.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [CartWriteRateThrottle]

    def post(self, request: Request, slug: str) -> Response:
        try:
            product = ProductService.get_public_by_slug(slug)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        try:
            order, created = OrderService.claim_free_product(request.user, product)
        except OrderError as exc:
            return domain_error_response(exc, default_code="not_free")

        return Response(
            {"order_id": str(order.pk), "product_id": str(product.pk), "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AdminProductListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = ProductPagination
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def get(self, request: Request) -> Response:
        status_filter = _parse_status_filter(request.query_params.get("status"))
        category_id = parse_uuid(
            request.query_params.get("category_id"),
            "category_id",
        )
        search = request.query_params.get("search") or None
        sku = request.query_params.get("sku") or None
        import_batch_id = request.query_params.get("import_batch_id") or None
        ordering = request.query_params.get("ordering") or None

        queryset = ProductService.list_admin(
            status=status_filter,
            category_id=category_id,
            search=search,
            sku=sku,
            import_batch_id=import_batch_id,
            ordering=ordering,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = ProductAdminSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = ProductCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            product = ProductService.create_product(
                ProductCreateData(
                    category_id=data["category_id"],
                    name=data["name"],
                    description=data.get("description", ""),
                    short_description=data.get("short_description", ""),
                    price=data["price"],
                    currency=data.get("currency", "USD"),
                    discount_price=data.get("discount_price"),
                    thumbnail=data.get("thumbnail", ""),
                    preview_model=data.get("preview_model", ""),
                    preview_video=data.get("preview_video", ""),
                    polygon_count=data.get("polygon_count"),
                    vertex_count=data.get("vertex_count"),
                    software_used=data.get("software_used", ""),
                    animated=data.get("animated", False),
                    rigged=data.get("rigged", False),
                    pbr_ready=data.get("pbr_ready", False),
                    game_ready=data.get("game_ready", False),
                    license_type=data.get("license_type", Product.LicenseType.STANDARD),
                    status=data.get("status", Product.Status.DRAFT),
                    sku=data.get("sku"),
                    import_batch_id=data.get("import_batch_id", ""),
                    import_source=data.get("import_source", ""),
                    glb_checksum=data.get("glb_checksum", ""),
                    has_thumbnail=data.get("has_thumbnail", False),
                    has_preview=data.get("has_preview", False),
                    has_package=data.get("has_package", False),
                )
            )
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_create",
            actor_id=str(request.user.pk),
            target_id=str(product.pk),
        )
        return Response(
            ProductAdminSerializer(product).data,
            status=status.HTTP_201_CREATED,
        )


class AdminProductDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def get(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        return Response(
            ProductAdminSerializer(product).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        serializer = ProductUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            updated = ProductService.update_product(
                product,
                ProductUpdateData(
                    category_id=data.get("category_id"),
                    name=data.get("name"),
                    slug=data.get("slug"),
                    description=data.get("description"),
                    short_description=data.get("short_description"),
                    price=data.get("price"),
                    currency=data.get("currency"),
                    discount_price=data.get("discount_price"),
                    clear_discount_price=data.get("clear_discount_price", False),
                    thumbnail=data.get("thumbnail"),
                    preview_model=data.get("preview_model"),
                    preview_video=data.get("preview_video"),
                    polygon_count=data.get("polygon_count"),
                    clear_polygon_count=data.get("clear_polygon_count", False),
                    vertex_count=data.get("vertex_count"),
                    clear_vertex_count=data.get("clear_vertex_count", False),
                    software_used=data.get("software_used"),
                    animated=data.get("animated"),
                    rigged=data.get("rigged"),
                    pbr_ready=data.get("pbr_ready"),
                    game_ready=data.get("game_ready"),
                    license_type=data.get("license_type"),
                    status=data.get("status"),
                    sku=data.get("sku"),
                    clear_sku=data.get("clear_sku", False),
                    import_batch_id=data.get("import_batch_id"),
                    import_source=data.get("import_source"),
                    glb_checksum=data.get("glb_checksum"),
                    has_thumbnail=data.get("has_thumbnail"),
                    has_preview=data.get("has_preview"),
                    has_package=data.get("has_package"),
                ),
            )
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_update",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            ProductAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        try:
            updated = ProductService.archive_product(product)
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_archive",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            ProductAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )


class AdminProductRestoreView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc
        try:
            restored = ProductService.restore_product(product)
        except ProductError as exc:
            return _product_error_response(exc)
        log_admin_action(
            action="product_restore", actor_id=str(request.user.pk), target_id=str(restored.pk),
        )
        return Response(ProductAdminSerializer(restored).data, status=status.HTTP_200_OK)


class AdminProductBulkDeleteView(APIView):
    """POST /api/admin/products/bulk-delete/ — delete selected products.

    All selected products are archived; product files and buyer downloads are retained.
    """

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        serializer = ProductBulkDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result: dict[str, list[str]] = {"deleted": [], "archived": [], "not_found": []}
        for product_id in dict.fromkeys(serializer.validated_data["product_ids"]):
            try:
                product = ProductService.get_by_id(product_id)
            except ProductError:
                result["not_found"].append(str(product_id))
                continue
            outcome = ProductService.delete_or_archive(product)
            result[outcome].append(str(product_id))
            log_admin_action(
                action=f"product_{'delete' if outcome == 'deleted' else 'archive'}",
                actor_id=str(request.user.pk),
                target_id=str(product_id),
                metadata={"name": product.name, "sku": product.sku or ""},
            )
        return Response(result, status=status.HTTP_200_OK)


class AdminProductImageUploadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle, AdminUploadRateThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        serializer = ProductImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            image = ProductService.add_image(
                product,
                serializer.validated_data["image"],
                display_order=serializer.validated_data.get("display_order", 0),
                is_primary=serializer.validated_data.get("is_primary", False),
            )
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_image_upload",
            actor_id=str(request.user.pk),
            target_id=str(product.pk),
        )
        return Response(
            ProductImageSerializer(image).data,
            status=status.HTTP_201_CREATED,
        )


class AdminProductImageDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]

    def delete(self, request: Request, product_id: UUID, image_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        try:
            ProductService.delete_image(product, image_id)
        except ProductError as exc:
            if exc.field is None and "not found" in exc.message.lower():
                raise NotFound(exc.message) from exc
            return _product_error_response(exc)

        log_admin_action(
            action="product_image_delete",
            actor_id=str(request.user.pk),
            target_id=str(product.pk),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminProductFileUploadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle, AdminUploadRateThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        serializer = ProductFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            product_file = ProductService.add_file(
                product,
                serializer.validated_data["file"],
                version=serializer.validated_data.get("version", "1.0"),
                is_preview=serializer.validated_data.get("is_preview", False),
            )
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_file_upload",
            actor_id=str(request.user.pk),
            target_id=str(product.pk),
        )
        return Response(
            ProductFileAdminSerializer(product_file).data,
            status=status.HTTP_201_CREATED,
        )


class AdminProductFileDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]

    def delete(self, request: Request, product_id: UUID, file_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        try:
            ProductService.delete_file(product, file_id)
        except ProductError as exc:
            if exc.field is None and "not found" in exc.message.lower():
                raise NotFound(exc.message) from exc
            return _product_error_response(exc)

        log_admin_action(
            action="product_file_delete",
            actor_id=str(request.user.pk),
            target_id=str(product.pk),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminCatalogImportView(APIView):
    """POST /api/admin/products/import/ — batch upsert pending_review by Model_ID/SKU."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        serializer = CatalogImportEnvelopeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        batch = CatalogImportService.import_batch(
            import_batch_id=data["import_batch_id"],
            import_source=data.get("import_source") or "catalog-bridge",
            items=data["items"],
            actor_id=str(request.user.pk),
        )

        log_admin_action(
            action="catalog_import",
            actor_id=str(request.user.pk),
            target_id=data["import_batch_id"],
            metadata=batch.audit_metadata() or None,
        )
        return Response(batch.to_dict(), status=status.HTTP_200_OK)


class CatalogIngestImportView(APIView):
    """POST /api/v1/catalog-ingest/import/ — the uploader exe's import, by API key.

    Same import as the admin route, outside /api/v1/admin/ because an unattended exe
    cannot pass the admin MFA sign-in, IP lock or Cloudflare Access. Accepts only
    ``Authorization: Api-Key <key>``; an administrator JWT is not enough.
    """

    authentication_classes = [CatalogApiKeyAuthentication]
    permission_classes = [CatalogIngestIPAllowed, HasCatalogApiKey]
    throttle_classes = [CatalogIngestRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request) -> Response:
        serializer = CatalogImportEnvelopeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        batch = CatalogImportService.import_batch(
            import_batch_id=data["import_batch_id"],
            import_source=data.get("import_source") or "catalog-bridge",
            items=data["items"],
            actor_id=str(request.user.pk),
        )

        key_prefix = request.auth.key_prefix
        logger.info(
            "catalog_ingest key_prefix=%s batch_id=%s items=%s created=%s updated=%s "
            "skipped=%s failed=%s preview_not_scanned=%s",
            key_prefix,
            data["import_batch_id"],
            len(data["items"]),
            batch.created,
            batch.updated,
            batch.skipped,
            batch.failed,
            "true" if batch.not_scanned_model_ids else "false",
        )
        log_admin_action(
            action="catalog_ingest_import",
            actor_id=str(request.user.pk),
            target_id=data["import_batch_id"],
            metadata={
                "key_prefix": key_prefix,
                "created": batch.created,
                "updated": batch.updated,
                "skipped": batch.skipped,
                "failed": batch.failed,
                **batch.audit_metadata(),
            },
        )
        return Response(batch.to_dict(), status=status.HTTP_200_OK)


class AdminProductApproveView(APIView):
    """POST /api/admin/products/<id>/approve/ — pending_review → published."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        serializer = ProductApproveSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        pricing = serializer.validated_data.get("pricing")

        try:
            updated = ProductService.approve_product(
                product,
                reviewer=request.user,
                pricing=pricing,
                price=serializer.validated_data.get("price"),
            )
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_approve",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
            metadata={"pricing": pricing, "price": str(updated.price)} if pricing else None,
        )
        return Response(
            ProductAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )


class AdminProductRejectView(APIView):
    """POST /api/admin/products/<id>/reject/ — pending_review → rejected."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        serializer = ProductRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            updated = ProductService.reject_product(
                product,
                reviewer=request.user,
                reason=data["reason"],
                qa_notes=data["qa_notes"] if "qa_notes" in data else None,
            )
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_reject",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            ProductAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )


class AdminProductRequeueView(APIView):
    """POST /api/admin/products/<id>/requeue/ — rejected → pending_review."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
    parser_classes = [JSONParser]

    def post(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        try:
            updated = ProductService.requeue_product(product)
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_requeue",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            ProductAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )
