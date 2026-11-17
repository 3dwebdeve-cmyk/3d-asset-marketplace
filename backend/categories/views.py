from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import (
    AdminCategoryWriteRateThrottle,
    CatalogSearchRateThrottle,
    CategoryClickRateThrottle,
)
from config.api_helpers import domain_error_response, parse_uuid
from config.http_cache import PublicCatalogCacheMixin
from categories.pagination import CategoryPagination
from search.services import normalize_query
from categories.serializers import (
    CategoryAdminSerializer,
    CategoryClickSerializer,
    CategoryCreateSerializer,
    CategoryMergeSerializer,
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


def _admin_category(category_id: UUID):
    try:
        return CategoryService.get_by_id(category_id)
    except CategoryError as exc:
        raise NotFound(exc.message) from exc


def _parse_parent_filter(value: str | None) -> UUID | None:
    return parse_uuid(value, "parent_id")


def _parse_bool_filter(value: str | None, field: str) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"true", "1"}:
        return True
    if normalized in {"false", "0"}:
        return False
    raise ValidationError({field: ["Must be true or false."]})


def _parse_trending_limit(value: str | None) -> int:
    if value is None or value.strip() == "":
        return 12
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValidationError({"limit": ["Must be an integer."]}) from exc
    if parsed < 1 or parsed > 50:
        raise ValidationError({"limit": ["Must be between 1 and 50."]})
    return parsed


class CategoryListView(PublicCatalogCacheMixin, APIView):
    permission_classes = [AllowAny]
    pagination_class = CategoryPagination

    def get_throttles(self) -> list:
        throttles = super().get_throttles()
        # Searching costs a query, so it gets the same limit as plugin and product search.
        if normalize_query(self.request.query_params.get("search")):
            throttles.append(CatalogSearchRateThrottle())
        return throttles

    def get(self, request: Request) -> Response:
        parent_id = _parse_parent_filter(request.query_params.get("parent_id"))
        search = normalize_query(request.query_params.get("search")) or None

        queryset = CategoryService.list_public(
            parent_id=parent_id,
            search=search,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = CategoryPublicSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class CategoryTrendingView(APIView):
    """Top clicked categories for the home hub. Short-lived ranking; no long CDN cache."""

    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        limit = _parse_trending_limit(request.query_params.get("limit"))
        queryset = CategoryService.list_trending(limit=limit)
        serializer = CategoryPublicSerializer(queryset, many=True)
        response = Response(serializer.data, status=status.HTTP_200_OK)
        response["Cache-Control"] = "public, max-age=60"
        return response


class CategoryClickView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [CategoryClickRateThrottle]

    def post(self, request: Request, category_id: UUID) -> Response:
        try:
            category = CategoryService.record_click(category_id)
        except CategoryError as exc:
            raise NotFound(exc.message) from exc

        serializer = CategoryClickSerializer(
            {"id": category.pk, "click_count": category.click_count}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


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
        is_active = _parse_bool_filter(request.query_params.get("is_active"), "is_active")
        pending_approval = _parse_bool_filter(
            request.query_params.get("pending_approval"), "pending_approval"
        )
        parent_id = _parse_parent_filter(request.query_params.get("parent_id"))
        search = request.query_params.get("search") or None

        queryset = CategoryService.list_admin(
            is_active=is_active,
            pending_approval=pending_approval,
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
                    code=serializer.validated_data.get("code") or None,
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
        category = _admin_category(category_id)

        return Response(
            CategoryAdminSerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, category_id: UUID) -> Response:
        category = _admin_category(category_id)

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
                    code=serializer.validated_data.get("code"),
                    clear_code=serializer.validated_data.get("clear_code", False),
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
        category = _admin_category(category_id)

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


class AdminCategoryApproveView(APIView):
    """POST /api/v1/admin/categories/<id>/approve/: a category an upload created goes live."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCategoryWriteRateThrottle]

    def post(self, request: Request, category_id: UUID) -> Response:
        category = _admin_category(category_id)
        try:
            approved = CategoryService.approve_category(category)
        except CategoryError as exc:
            return _category_error_response(exc)
        log_admin_action(
            action="category_approve",
            actor_id=str(request.user.pk),
            target_id=str(approved.pk),
            metadata={"code": approved.code},
        )
        return Response(
            CategoryAdminSerializer(CategoryService.get_by_id(approved.pk)).data,
            status=status.HTTP_200_OK,
        )


class AdminCategoryMergeView(APIView):
    """POST /api/v1/admin/categories/<id>/merge/ {"into": <id>}: move a pending category's
    models into an active category, then delete it. Returns the target category."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCategoryWriteRateThrottle]

    def post(self, request: Request, category_id: UUID) -> Response:
        category = _admin_category(category_id)
        serializer = CategoryMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            target, moved = CategoryService.merge_category(
                category, serializer.validated_data["into"]
            )
        except CategoryError as exc:
            return _category_error_response(exc)
        log_admin_action(
            action="category_merge",
            actor_id=str(request.user.pk),
            target_id=str(category_id),
            metadata={"into": str(target.pk), "code": target.code, "models_moved": moved},
        )
        return Response(CategoryAdminSerializer(target).data, status=status.HTTP_200_OK)


class AdminCategoryRejectView(APIView):
    """POST /api/v1/admin/categories/<id>/reject/: delete an empty pending category (204), or
    keep one with models hidden and rejected (200 with the category)."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCategoryWriteRateThrottle]

    def post(self, request: Request, category_id: UUID) -> Response:
        category = _admin_category(category_id)
        try:
            rejected = CategoryService.reject_category(category)
        except CategoryError as exc:
            return _category_error_response(exc)
        log_admin_action(
            action="category_reject",
            actor_id=str(request.user.pk),
            target_id=str(category_id),
            metadata={"deleted": rejected is None},
        )
        if rejected is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(
            CategoryAdminSerializer(CategoryService.get_by_id(rejected.pk)).data,
            status=status.HTTP_200_OK,
        )
