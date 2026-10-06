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
from accounts.throttles import AdminPluginWriteRateThrottle, CatalogSearchRateThrottle
from config.api_helpers import domain_error_response, parse_uuid
from config.http_cache import PublicCatalogCacheMixin
from plugins.models import Plugin
from plugins.pagination import PluginPagination
from plugins.serializers import (
    PluginAdminListSerializer,
    PluginAdminSerializer,
    PluginCategoryCreateSerializer,
    PluginCategorySerializer,
    PluginCategoryUpdateSerializer,
    PluginCreateSerializer,
    PluginDetailPublicSerializer,
    PluginFileAdminSerializer,
    PluginFileUploadSerializer,
    PluginImageSerializer,
    PluginImageUploadSerializer,
    PluginListPublicSerializer,
    PluginUpdateSerializer,
)
from plugins.services import (
    PluginCategoryCreateData,
    PluginCategoryService,
    PluginCategoryUpdateData,
    PluginCreateData,
    PluginError,
    PluginService,
    PluginUpdateData,
)
from search.services import normalize_query


def _error_response(exc: PluginError) -> Response:
    return domain_error_response(exc, default_code="plugin_error")


def _parse_boolean(value: str | None, field: str) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"true", "1"}:
        return True
    if normalized in {"false", "0"}:
        return False
    raise ValidationError({field: [f"Invalid {field} filter."]})


def _parse_status(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in {choice.value for choice in Plugin.Status}:
        raise ValidationError({"status": ["Invalid status filter."]})
    return normalized


class PluginCategoryListView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]
    pagination_class = PluginPagination

    def get(self, request: Request) -> Response:
        queryset = PluginCategoryService.list_public(
            search=request.query_params.get("search") or None
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            PluginCategorySerializer(page, many=True).data
        )


class PluginCategoryDetailView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, slug: str) -> Response:
        try:
            category = PluginCategoryService.get_public_by_slug(slug)
        except PluginError as exc:
            raise NotFound(exc.message) from exc
        return Response(
            PluginCategorySerializer(category).data,
            status=status.HTTP_200_OK,
        )


class PluginListView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]
    pagination_class = PluginPagination

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
        paginator = self.pagination_class()
        queryset = PluginService.list_public(
            category_id=category_id,
            search=search,
            ordering=ordering,
        )
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            PluginListPublicSerializer(page, many=True).data
        )


class PluginDetailView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, slug: str) -> Response:
        try:
            plugin = PluginService.get_public_by_slug(slug)
        except PluginError as exc:
            raise NotFound(exc.message) from exc
        return Response(
            PluginDetailPublicSerializer(plugin).data,
            status=status.HTTP_200_OK,
        )


class AdminPluginCategoryListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]
    parser_classes = [JSONParser]
    pagination_class = PluginPagination

    def get(self, request: Request) -> Response:
        queryset = PluginCategoryService.list_admin(
            is_active=_parse_boolean(
                request.query_params.get("is_active"),
                "is_active",
            ),
            search=request.query_params.get("search") or None,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            PluginCategorySerializer(page, many=True).data
        )

    def post(self, request: Request) -> Response:
        serializer = PluginCategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            category = PluginCategoryService.create_category(
                PluginCategoryCreateData(
                    name=data["name"],
                    description=data.get("description", ""),
                    image=data.get("image", ""),
                )
            )
        except PluginError as exc:
            return _error_response(exc)
        log_admin_action(
            action="plugin_category_create",
            actor_id=str(request.user.pk),
            target_id=str(category.pk),
        )
        return Response(
            PluginCategorySerializer(category).data,
            status=status.HTTP_201_CREATED,
        )


class AdminPluginCategoryDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]
    parser_classes = [JSONParser]

    def get(self, request: Request, category_id: UUID) -> Response:
        category = self._get_category(category_id)
        return Response(
            PluginCategorySerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, category_id: UUID) -> Response:
        category = self._get_category(category_id)
        serializer = PluginCategoryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            category = PluginCategoryService.update_category(
                category,
                PluginCategoryUpdateData(
                    name=data.get("name"),
                    slug=data.get("slug"),
                    description=data.get("description"),
                    image=data.get("image"),
                    is_active=data.get("is_active"),
                ),
            )
        except PluginError as exc:
            return _error_response(exc)
        log_admin_action(
            action="plugin_category_update",
            actor_id=str(request.user.pk),
            target_id=str(category.pk),
        )
        return Response(
            PluginCategorySerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, category_id: UUID) -> Response:
        category = self._get_category(category_id)
        try:
            category = PluginCategoryService.deactivate_category(category)
        except PluginError as exc:
            return _error_response(exc)
        log_admin_action(
            action="plugin_category_deactivate",
            actor_id=str(request.user.pk),
            target_id=str(category.pk),
        )
        return Response(
            PluginCategorySerializer(category).data,
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _get_category(category_id: UUID):
        try:
            return PluginCategoryService.get_by_id(category_id)
        except PluginError as exc:
            raise NotFound(exc.message) from exc


class AdminPluginListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]
    parser_classes = [JSONParser]
    pagination_class = PluginPagination

    def get(self, request: Request) -> Response:
        queryset = PluginService.list_admin(
            status=_parse_status(request.query_params.get("status")),
            category_id=parse_uuid(
                request.query_params.get("category_id"),
                "category_id",
            ),
            search=request.query_params.get("search") or None,
            ordering=request.query_params.get("ordering") or None,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            PluginAdminListSerializer(page, many=True).data
        )

    def post(self, request: Request) -> Response:
        serializer = PluginCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            plugin = PluginService.create_plugin(
                PluginCreateData(
                    category_id=data["category_id"],
                    name=data["name"],
                    price=data["price"],
                    description=data.get("description", ""),
                    short_description=data.get("short_description", ""),
                    currency=data.get("currency", "USD"),
                    discount_price=data.get("discount_price"),
                    thumbnail=data.get("thumbnail", ""),
                    version=data.get("version", "1.0"),
                    compatibility=data.get("compatibility", ""),
                    documentation_url=data.get("documentation_url", ""),
                    license_type=data.get(
                        "license_type",
                        Plugin.LicenseType.STANDARD,
                    ),
                    status=data.get("status", Plugin.Status.DRAFT),
                )
            )
        except PluginError as exc:
            return _error_response(exc)
        log_admin_action(
            action="plugin_create",
            actor_id=str(request.user.pk),
            target_id=str(plugin.pk),
        )
        return Response(
            PluginAdminSerializer(plugin).data,
            status=status.HTTP_201_CREATED,
        )


class AdminPluginDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]
    parser_classes = [JSONParser]

    def get(self, request: Request, plugin_id: UUID) -> Response:
        plugin = self._get_plugin(plugin_id)
        return Response(
            PluginAdminSerializer(plugin).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, plugin_id: UUID) -> Response:
        plugin = self._get_plugin(plugin_id)
        serializer = PluginUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            plugin = PluginService.update_plugin(
                plugin,
                PluginUpdateData(
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
                    version=data.get("version"),
                    compatibility=data.get("compatibility"),
                    documentation_url=data.get("documentation_url"),
                    license_type=data.get("license_type"),
                    status=data.get("status"),
                ),
            )
        except PluginError as exc:
            return _error_response(exc)
        log_admin_action(
            action="plugin_update",
            actor_id=str(request.user.pk),
            target_id=str(plugin.pk),
        )
        return Response(
            PluginAdminSerializer(plugin).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, plugin_id: UUID) -> Response:
        plugin = self._get_plugin(plugin_id)
        plugin = PluginService.archive_plugin(plugin)
        log_admin_action(
            action="plugin_archive",
            actor_id=str(request.user.pk),
            target_id=str(plugin.pk),
        )
        return Response(
            PluginAdminSerializer(plugin).data,
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _get_plugin(plugin_id: UUID) -> Plugin:
        try:
            return PluginService.get_by_id(plugin_id)
        except PluginError as exc:
            raise NotFound(exc.message) from exc

    @staticmethod
    def _get_plugin_for_mutation(plugin_id: UUID) -> Plugin:
        try:
            return PluginService.get_for_mutation_by_id(plugin_id)
        except PluginError as exc:
            raise NotFound(exc.message) from exc


class AdminPluginImageUploadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request, plugin_id: UUID) -> Response:
        plugin = AdminPluginDetailView._get_plugin_for_mutation(plugin_id)
        serializer = PluginImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = PluginService.add_image(
            plugin,
            serializer.validated_upload,
            display_order=serializer.validated_data.get("display_order", 0),
            is_primary=serializer.validated_data.get("is_primary", False),
        )
        log_admin_action(
            action="plugin_image_upload",
            actor_id=str(request.user.pk),
            target_id=str(plugin.pk),
        )
        return Response(
            PluginImageSerializer(image).data,
            status=status.HTTP_201_CREATED,
        )


class AdminPluginImageDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]

    def delete(self, request: Request, plugin_id: UUID, image_id: UUID) -> Response:
        plugin = AdminPluginDetailView._get_plugin_for_mutation(plugin_id)
        try:
            PluginService.delete_image(plugin, image_id)
        except PluginError as exc:
            raise NotFound(exc.message) from exc
        log_admin_action(
            action="plugin_image_delete",
            actor_id=str(request.user.pk),
            target_id=str(plugin.pk),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminPluginFileUploadView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request, plugin_id: UUID) -> Response:
        plugin = AdminPluginDetailView._get_plugin_for_mutation(plugin_id)
        serializer = PluginFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plugin_file = PluginService.add_file(
            plugin,
            serializer.validated_upload,
            version=serializer.validated_data.get("version", "1.0"),
            is_primary=serializer.validated_data.get("is_primary", False),
        )
        log_admin_action(
            action="plugin_file_upload",
            actor_id=str(request.user.pk),
            target_id=str(plugin.pk),
        )
        return Response(
            PluginFileAdminSerializer(plugin_file).data,
            status=status.HTTP_201_CREATED,
        )


class AdminPluginFileDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminPluginWriteRateThrottle]

    def delete(self, request: Request, plugin_id: UUID, file_id: UUID) -> Response:
        plugin = AdminPluginDetailView._get_plugin_for_mutation(plugin_id)
        try:
            PluginService.delete_file(plugin, file_id)
        except PluginError as exc:
            raise NotFound(exc.message) from exc
        log_admin_action(
            action="plugin_file_delete",
            actor_id=str(request.user.pk),
            target_id=str(plugin.pk),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
