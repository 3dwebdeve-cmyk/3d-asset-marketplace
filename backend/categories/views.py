from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import AdminCategoryWriteRateThrottle
from config.api_helpers import domain_error_response, parse_uuid
from config.http_cache import PublicCatalogCacheMixin
from categories.pagination import CategoryPagination
from categories.serializers import (
    CategoryAdminSerializer,
    CategoryCreateSerializer,
    CategoryPublicSerializer,
    CategoryUpdateSerializer,
)
from categories.services import (
    CategoryCreateData,
    CategoryError,
    CategoryService,
    CategoryUpdateData,
)

def _category_error_response(exc: CategoryError) -> Response:
    return domain_error_response(exc, default_code="category_error")


def _parse_parent_filter(value: str | None) -> UUID | None:
    return parse_uuid(value, "parent_id")


def _parse_is_active_filter(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"true", "1"}:
        return True
    if normalized in {"false", "0"}:
        return False
    raise ValidationError({"is_active": ["Must be true or false."]})


class CategoryListView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]
    pagination_class = CategoryPagination

    def get(self, request: Request) -> Response:
        parent_id = _parse_parent_filter(request.query_params.get("parent_id"))
        search = request.query_params.get("search") or None

        queryset = CategoryService.list_public(
            parent_id=parent_id,
            search=search,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = CategoryPublicSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class CategoryDetailView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, slug: str) -> Response:
        try:
            category = CategoryService.get_public_by_slug(slug)
        except CategoryError as exc:
            raise NotFound(exc.message) from exc

        serializer = CategoryPublicSerializer(category)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminCategoryListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = CategoryPagination
    throttle_classes = [AdminCategoryWriteRateThrottle]

    def get(self, request: Request) -> Response:
        is_active = _parse_is_active_filter(request.query_params.get("is_active"))
        parent_id = _parse_parent_filter(request.query_params.get("parent_id"))
        search = request.query_params.get("search") or None

        queryset = CategoryService.list_admin(
            is_active=is_active,
            parent_id=parent_id,
            search=search,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = CategoryAdminSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = CategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            category = CategoryService.create_category(
                CategoryCreateData(
                    name=serializer.validated_data["name"],
                    description=serializer.validated_data.get("description", ""),
                    image=serializer.validated_data.get("image", ""),
                    parent_id=serializer.validated_data.get("parent_id"),
                )
            )
        except CategoryError as exc:
            return _category_error_response(exc)

        log_admin_action(
            action="category_create",
            actor_id=str(request.user.pk),
            target_id=str(category.pk),
        )
        return Response(
            CategoryAdminSerializer(category).data,
            status=status.HTTP_201_CREATED,
        )


class AdminCategoryDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCategoryWriteRateThrottle]

    def get(self, request: Request, category_id: UUID) -> Response:
        try:
            category = CategoryService.get_by_id(category_id)
        except CategoryError as exc:
            raise NotFound(exc.message) from exc

        return Response(
            CategoryAdminSerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, category_id: UUID) -> Response:
        try:
            category = CategoryService.get_by_id(category_id)
        except CategoryError as exc:
            raise NotFound(exc.message) from exc

        serializer = CategoryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = CategoryService.update_category(
                category,
                CategoryUpdateData(
                    name=serializer.validated_data.get("name"),
                    slug=serializer.validated_data.get("slug"),
                    description=serializer.validated_data.get("description"),
                    image=serializer.validated_data.get("image"),
                    parent_id=serializer.validated_data.get("parent_id"),
                    clear_parent=serializer.validated_data.get("clear_parent", False),
                    is_active=serializer.validated_data.get("is_active"),
                ),
            )
        except CategoryError as exc:
            return _category_error_response(exc)

        log_admin_action(
            action="category_update",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            CategoryAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, category_id: UUID) -> Response:
        try:
            category = CategoryService.get_by_id(category_id)
        except CategoryError as exc:
            raise NotFound(exc.message) from exc

        try:
            updated = CategoryService.deactivate_category(category)
        except CategoryError as exc:
            return _category_error_response(exc)

        log_admin_action(
            action="category_deactivate",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            CategoryAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )
