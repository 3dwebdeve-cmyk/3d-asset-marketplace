import re
from dataclasses import dataclass
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q, QuerySet
from django.utils import timezone

from categories.models import CATEGORY_CODE_REGEX, Category

_CODE_RE = re.compile(CATEGORY_CODE_REGEX)


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
    code: str | None = None


@dataclass(frozen=True)
class CategoryUpdateData:
    name: str | None = None
    description: str | None = None
    image: str | None = None
    parent_id: UUID | None = None
    clear_parent: bool = False
    is_active: bool | None = None
    slug: str | None = None
    # A new model code; clear_code removes it. Both only while the category has no models.
    code: str | None = None
    clear_code: bool = False


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
    def list_trending(cls, *, limit: int = 12) -> QuerySet[Category]:
        safe_limit = max(1, min(limit, 50))
        return (
            Category.objects.filter(is_active=True, parent__isnull=True)
            .select_related("parent")
            .order_by("-click_count", "name")[:safe_limit]
        )

    @classmethod
    def record_click(cls, category_id: UUID) -> Category:
        updated = Category.objects.filter(pk=category_id, is_active=True).update(
            click_count=F("click_count") + 1
        )
        if updated == 0:
            raise CategoryError("Category not found.")
        return Category.objects.select_related("parent").get(pk=category_id)

    @classmethod
    def list_admin(
        cls,
        *,
        is_active: bool | None = None,
        pending_approval: bool | None = None,
        parent_id: UUID | None = None,
        search: str | None = None,
    ) -> QuerySet[Category]:
        queryset = cls._admin_queryset()

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if pending_approval is not None:
            queryset = queryset.filter(pending_approval=pending_approval)
        if parent_id is not None:
            queryset = queryset.filter(parent_id=parent_id)
        if search:
            query = search.strip()
            if query:
                queryset = queryset.filter(
                    Q(name__icontains=query)
                    | Q(description__icontains=query)
                    | Q(slug__icontains=query)
                    | Q(code__iexact=query)
                )

        return queryset.order_by("name")

    @staticmethod
    def _admin_queryset() -> QuerySet[Category]:
        return Category.objects.select_related("parent").annotate(product_count=Count("products"))

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
            return cls._admin_queryset().get(pk=category_id)
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
        code = cls._clean_code(data.code) if data.code else None

        try:
            with transaction.atomic():
                return Category.objects.create(
                    name=name,
                    slug=slug,
                    description=data.description.strip(),
                    image=data.image.strip(),
                    parent=parent,
                    code=code,
                )
        except IntegrityError as exc:
            raise CategoryError(_code_taken(code), field="code") from exc

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

        # An explicit slug is honoured even when a name is sent with it.
        if data.slug is not None:
            slug = data.slug.strip().lower()
            if not slug:
                raise CategoryError("Slug cannot be empty.", field="slug")
            if Category.objects.filter(slug=slug).exclude(pk=category.pk).exists():
                raise CategoryError("A category with this slug already exists.", field="slug")
            category.slug = slug
            update_fields.append("slug")

        if data.is_active is not None:
            if data.is_active and category.pending_approval:
                raise CategoryError(
                    "This category is waiting for approval: approve it instead.",
                    field="is_active",
                )
            if not data.is_active:
                cls._ensure_can_deactivate(category)
            category.is_active = data.is_active
            update_fields.append("is_active")

        if data.clear_code or data.code is not None:
            new_code = None if data.clear_code else cls._clean_code(data.code)
            if new_code != category.code:
                cls._ensure_code_editable(category)
                category.code = new_code
                update_fields.append("code")

        try:
            with transaction.atomic():
                category.save(update_fields=list(dict.fromkeys(update_fields)))
        except IntegrityError as exc:
            raise CategoryError(_code_taken(category.code), field="code") from exc
        return category

    @classmethod
    @transaction.atomic
    def approve_category(cls, category: Category) -> Category:
        """A category an upload created goes live; its models can then be approved."""
        cls._ensure_pending(category)
        category.is_active = True
        category.pending_approval = False
        category.rejected_at = None
        category.save(update_fields=["is_active", "pending_approval", "rejected_at", "updated_at"])
        return category

    @classmethod
    @transaction.atomic
    def merge_category(cls, category: Category, into_id: UUID) -> tuple[Category, int]:
        """Move a pending category's models into an active category and delete it.

        For a typo ("Furnture" into "Furniture"). The target keeps its own code; a target with
        no code takes this one, so later uploads with that code go there. Returns the target
        and the number of models moved.
        """
        cls._ensure_pending(category)
        target = (
            Category.objects.filter(pk=into_id, is_active=True, pending_approval=False)
            .exclude(pk=category.pk)
            .first()
        )
        if target is None:
            raise CategoryError(
                "Pick an active category that is not waiting for approval.", field="into"
            )
        if category.children.exists():
            raise CategoryError("Move this category's subcategories first.", field="into")
        moved = category.products.update(category=target)
        code = category.code
        category.delete()
        if target.code is None and code:
            target.code = code
            target.save(update_fields=["code", "updated_at"])
        return cls.get_by_id(target.pk), moved

    @classmethod
    @transaction.atomic
    def reject_category(cls, category: Category) -> Category | None:
        """Reject a category an upload created. With no models it is deleted (returns None).
        With models it stays hidden and rejected: they cannot be approved until an admin
        approves the category or merges it into another one."""
        cls._ensure_pending(category)
        if not category.products.exists():
            category.delete()
            return None
        category.rejected_at = timezone.now()
        category.save(update_fields=["rejected_at", "updated_at"])
        return category

    @staticmethod
    def _ensure_pending(category: Category) -> None:
        if not category.pending_approval:
            raise CategoryError("This category is not waiting for approval.", field="category")

    @staticmethod
    def _clean_code(raw: str | None) -> str:
        code = (raw or "").strip()
        if not _CODE_RE.fullmatch(code):
            raise CategoryError("A code is 2 to 5 capital letters, for example ELE.", field="code")
        return code

    @staticmethod
    def _ensure_code_editable(category: Category) -> None:
        # The code is in every Model ID of the category's models, so it never changes after.
        if category.products.exists():
            raise CategoryError(
                "The model code cannot change once the category has models.", field="code"
            )

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


def _code_taken(code: str | None) -> str:
    return f"Another category already has the code {code}."
