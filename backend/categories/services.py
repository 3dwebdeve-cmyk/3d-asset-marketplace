from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.db.models import Q, QuerySet

from categories.models import Category


class CategoryError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


@dataclass(frozen=True)
class CategoryCreateData:
    name: str
    description: str = ""
    image: str = ""
    parent_id: UUID | None = None


@dataclass(frozen=True)
class CategoryUpdateData:
    name: str | None = None
    description: str | None = None
    image: str | None = None
    parent_id: UUID | None = None
    clear_parent: bool = False
    is_active: bool | None = None
    slug: str | None = None


class CategoryService:
    @classmethod
    def list_public(
        cls,
        *,
        parent_id: UUID | None = None,
        search: str | None = None,
    ) -> QuerySet[Category]:
        queryset = Category.objects.filter(is_active=True).select_related("parent")

        if parent_id is not None:
            queryset = queryset.filter(parent_id=parent_id)
        if search:
            query = search.strip()
            if query:
                queryset = queryset.filter(
                    Q(name__icontains=query) | Q(description__icontains=query)
                )

        return queryset.order_by("name")

    @classmethod
    def list_admin(
        cls,
        *,
        is_active: bool | None = None,
        parent_id: UUID | None = None,
        search: str | None = None,
    ) -> QuerySet[Category]:
        queryset = Category.objects.select_related("parent")

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if parent_id is not None:
            queryset = queryset.filter(parent_id=parent_id)
        if search:
            query = search.strip()
            if query:
                queryset = queryset.filter(
                    Q(name__icontains=query)
                    | Q(description__icontains=query)
                    | Q(slug__icontains=query)
                )

        return queryset.order_by("name")

    @classmethod
    def get_public_by_slug(cls, slug: str) -> Category:
        try:
            return Category.objects.select_related("parent").get(
                slug=slug.strip(),
                is_active=True,
            )
        except Category.DoesNotExist as exc:
            raise CategoryError("Category not found.") from exc

    @classmethod
    def get_by_id(cls, category_id: UUID) -> Category:
        try:
            return Category.objects.select_related("parent").get(pk=category_id)
        except Category.DoesNotExist as exc:
            raise CategoryError("Category not found.") from exc

    @classmethod
    @transaction.atomic
    def create_category(cls, data: CategoryCreateData) -> Category:
        name = data.name.strip()
        if len(name) < 2:
            raise CategoryError("Name must be at least 2 characters.", field="name")

        parent = cls._resolve_parent(data.parent_id)
        slug = Category.build_slug(name)

        return Category.objects.create(
            name=name,
            slug=slug,
            description=data.description.strip(),
            image=data.image.strip(),
            parent=parent,
        )

    @classmethod
    @transaction.atomic
    def update_category(
        cls,
        category: Category,
        data: CategoryUpdateData,
    ) -> Category:
        update_fields: list[str] = ["updated_at"]

        if data.name is not None:
            name = data.name.strip()
            if len(name) < 2:
                raise CategoryError("Name must be at least 2 characters.", field="name")
            category.name = name
            category.slug = Category.build_slug(name, exclude_id=category.pk)
            update_fields.extend(["name", "slug"])

        if data.description is not None:
            category.description = data.description.strip()
            update_fields.append("description")

        if data.image is not None:
            category.image = data.image.strip()
            update_fields.append("image")

        if data.clear_parent:
            category.parent = None
            update_fields.append("parent")
        elif data.parent_id is not None:
            category.parent = cls._resolve_parent(data.parent_id, category=category)
            update_fields.append("parent")

        if data.slug is not None and data.name is None:
            slug = data.slug.strip().lower()
            if not slug:
                raise CategoryError("Slug cannot be empty.", field="slug")
            if Category.objects.filter(slug=slug).exclude(pk=category.pk).exists():
                raise CategoryError("A category with this slug already exists.", field="slug")
            category.slug = slug
            update_fields.append("slug")

        if data.is_active is not None:
            if not data.is_active:
                cls._ensure_can_deactivate(category)
            category.is_active = data.is_active
            update_fields.append("is_active")

        category.save(update_fields=list(dict.fromkeys(update_fields)))
        return category

    @classmethod
    @transaction.atomic
    def deactivate_category(cls, category: Category) -> Category:
        return cls.update_category(
            category,
            CategoryUpdateData(is_active=False),
        )

    @classmethod
    def _resolve_parent(
        cls,
        parent_id: UUID | None,
        *,
        category: Category | None = None,
    ) -> Category | None:
        if parent_id is None:
            return None

        try:
            parent = Category.objects.get(pk=parent_id, is_active=True)
        except Category.DoesNotExist as exc:
            raise CategoryError("Parent category not found.", field="parent_id") from exc

        if category is not None:
            if parent.pk == category.pk:
                raise CategoryError(
                    "A category cannot be its own parent.",
                    field="parent_id",
                )
            if cls._is_descendant(category, parent):
                raise CategoryError(
                    "A category cannot be moved under one of its descendants.",
                    field="parent_id",
                )

        return parent

    @staticmethod
    def _is_descendant(ancestor: Category, node: Category) -> bool:
        current = node.parent
        while current is not None:
            if current.pk == ancestor.pk:
                return True
            current = current.parent
        return False

    @classmethod
    def _ensure_can_deactivate(cls, category: Category) -> None:
        if Category.objects.filter(parent=category, is_active=True).exists():
            raise CategoryError(
                "Deactivate child categories before deactivating this category.",
                field="is_active",
            )
