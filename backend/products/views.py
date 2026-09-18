from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import AdminProductWriteRateThrottle
from config.api_helpers import domain_error_response, parse_uuid
from products.catalog_import import CatalogImportService
from products.models import Product
from products.pagination import ProductPagination
from products.serializers import (
    CatalogImportEnvelopeSerializer,
    ProductAdminSerializer,
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
from search.pagination import paginated_list_response, parse_page
from search.services import hydrate_products, normalize_query, search_published_products


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


class ProductListView(APIView):
    permission_classes = [AllowAny]
    pagination_class = ProductPagination

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
        query = normalize_query(search)
        if query:
            page, page_size = parse_page(request, paginator)
            search_page = search_published_products(
                query=query,
                page=page,
                page_size=page_size,
                category_id=category_id,
                ordering=ordering,
                animated=animated,
                rigged=rigged,
                pbr_ready=pbr_ready,
                game_ready=game_ready,
            )
            if search_page is not None:
                items = hydrate_products(search_page.ids)
                return paginated_list_response(
                    request,
                    paginator=paginator,
                    items=items,
                    total=search_page.estimated_total,
                    page=page,
                    page_size=page_size,
                    serializer_class=ProductListPublicSerializer,
                )

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


class ProductDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, slug: str) -> Response:
        try:
            product = ProductService.get_public_by_slug(slug)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        serializer = ProductDetailPublicSerializer(product)
        return Response(serializer.data, status=status.HTTP_200_OK)


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


class AdminProductImageUploadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]
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
    throttle_classes = [AdminProductWriteRateThrottle]
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

        try:
            updated = ProductService.approve_product(product, reviewer=request.user)
        except ProductError as exc:
            return _product_error_response(exc)

        log_admin_action(
            action="product_approve",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
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
