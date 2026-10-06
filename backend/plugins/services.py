from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from django.db import transaction
from django.db.models import Prefetch, Q, QuerySet

from config.media import private_object_exists
from config.currency import normalize_currency, validate_catalog_prices
from plugins.models import Plugin, PluginCategory, PluginFile, PluginImage
from plugins.storage import PluginMediaStorageService
from plugins.upload_rules import ValidatedPluginFileUpload
from products.upload_rules import ValidatedProductImageUpload
from search.tasks import enqueue_sync_plugin


class PluginError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


@dataclass(frozen=True)
class PluginCategoryCreateData:
    name: str
    description: str = ""
    image: str = ""


@dataclass(frozen=True)
class PluginCategoryUpdateData:
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    image: str | None = None
    is_active: bool | None = None


@dataclass(frozen=True)
class PluginCreateData:
    category_id: UUID
    name: str
    price: Decimal
    description: str = ""
    short_description: str = ""
    currency: str = "USD"
    discount_price: Decimal | None = None
    thumbnail: str = ""
    version: str = "1.0"
    compatibility: str = ""
    documentation_url: str = ""
    license_type: str = Plugin.LicenseType.STANDARD
    status: str = Plugin.Status.DRAFT


@dataclass(frozen=True)
class PluginUpdateData:
    category_id: UUID | None = None
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    short_description: str | None = None
    price: Decimal | None = None
    currency: str | None = None
    discount_price: Decimal | None = None
    clear_discount_price: bool = False
    thumbnail: str | None = None
    version: str | None = None
    compatibility: str | None = None
    documentation_url: str | None = None
    license_type: str | None = None
    status: str | None = None


class PluginCategoryService:
    @classmethod
    def list_public(cls, *, search: str | None = None) -> QuerySet[PluginCategory]:
        queryset = PluginCategory.objects.filter(is_active=True)
        if search and search.strip():
            query = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=query) | Q(description__icontains=query)
            )
        return queryset.order_by("name")

    @classmethod
    def list_admin(
        cls,
        *,
        is_active: bool | None = None,
        search: str | None = None,
    ) -> QuerySet[PluginCategory]:
        queryset = PluginCategory.objects.all()
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)
        if search and search.strip():
            query = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(slug__icontains=query)
            )
        return queryset.order_by("name")

    @staticmethod
    def get_public_by_slug(slug: str) -> PluginCategory:
        try:
            return PluginCategory.objects.get(
                slug=slug.strip(),
                is_active=True,
            )
        except PluginCategory.DoesNotExist as exc:
            raise PluginError("Plugin category not found.") from exc

    @staticmethod
    def get_by_id(category_id: UUID) -> PluginCategory:
        try:
            return PluginCategory.objects.get(pk=category_id)
        except PluginCategory.DoesNotExist as exc:
            raise PluginError("Plugin category not found.") from exc

    @classmethod
    @transaction.atomic
    def create_category(cls, data: PluginCategoryCreateData) -> PluginCategory:
        name = cls._normalize_name(data.name)
        return PluginCategory.objects.create(
            name=name,
            slug=PluginCategory.build_slug(name),
            description=data.description.strip(),
            image=data.image.strip(),
        )

    @classmethod
    @transaction.atomic
    def update_category(
        cls,
        category: PluginCategory,
        data: PluginCategoryUpdateData,
    ) -> PluginCategory:
        update_fields: list[str] = ["updated_at"]
        if data.name is not None:
            category.name = cls._normalize_name(data.name)
            category.slug = PluginCategory.build_slug(
                category.name,
                exclude_id=category.pk,
            )
            update_fields.extend(["name", "slug"])
        elif data.slug is not None:
            slug = data.slug.strip().lower()
            if not slug:
                raise PluginError("Slug cannot be empty.", field="slug")
            if PluginCategory.objects.filter(slug=slug).exclude(pk=category.pk).exists():
                raise PluginError(
                    "A plugin category with this slug already exists.",
                    field="slug",
                )
            category.slug = slug
            update_fields.append("slug")
        if data.description is not None:
            category.description = data.description.strip()
            update_fields.append("description")
        if data.image is not None:
            category.image = data.image.strip()
            update_fields.append("image")
        if data.is_active is not None:
            if not data.is_active and category.plugins.exclude(
                status=Plugin.Status.ARCHIVED
            ).exists():
                raise PluginError(
                    "Archive plugins in this category before deactivating it.",
                    field="is_active",
                )
            category.is_active = data.is_active
            update_fields.append("is_active")
        category.save(update_fields=list(dict.fromkeys(update_fields)))
        return category

    @classmethod
    def deactivate_category(cls, category: PluginCategory) -> PluginCategory:
        return cls.update_category(
            category,
            PluginCategoryUpdateData(is_active=False),
        )

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized = name.strip()
        if len(normalized) < 2:
            raise PluginError("Name must be at least 2 characters.", field="name")
        return normalized


class PluginService:
    @classmethod
    def _base_queryset(cls) -> QuerySet[Plugin]:
        return Plugin.objects.select_related("category").prefetch_related(
            Prefetch("images", queryset=PluginImage.objects.order_by("display_order")),
            Prefetch("files", queryset=PluginFile.objects.order_by("-is_primary")),
        )

    @classmethod
    def list_public(
        cls,
        *,
        category_id: UUID | None = None,
        search: str | None = None,
        ordering: str | None = None,
    ) -> QuerySet[Plugin]:
        # Public list responses do not serialize images or files. Avoid loading
        # media collections for every row; detail/admin serializers still use
        # the media-prefetching base queryset.
        queryset = (
            Plugin.objects.select_related("category")
            .filter(
                status=Plugin.Status.PUBLISHED,
                category__is_active=True,
            )
            .defer(
                "description",
                "documentation_url",
                "status",
            )
        )
        return cls._filter_list(
            queryset,
            category_id=category_id,
            search=search,
            ordering=ordering,
        )

    @classmethod
    def list_admin(
        cls,
        *,
        status: str | None = None,
        category_id: UUID | None = None,
        search: str | None = None,
        ordering: str | None = None,
    ) -> QuerySet[Plugin]:
        queryset = Plugin.objects.select_related("category")
        if status is not None:
            queryset = queryset.filter(status=status)
        return cls._filter_list(
            queryset,
            category_id=category_id,
            search=search,
            ordering=ordering,
        )

    @classmethod
    def _filter_list(
        cls,
        queryset: QuerySet[Plugin],
        *,
        category_id: UUID | None,
        search: str | None,
        ordering: str | None,
    ) -> QuerySet[Plugin]:
        from search.services import normalize_query

        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        query = normalize_query(search)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(short_description__icontains=query)
                | Q(compatibility__icontains=query)
            )
        return queryset.order_by(cls._resolve_ordering(ordering))

    @classmethod
    def get_public_by_slug(cls, slug: str) -> Plugin:
        try:
            return cls._base_queryset().get(
                slug=slug.strip(),
                status=Plugin.Status.PUBLISHED,
                category__is_active=True,
            )
        except Plugin.DoesNotExist as exc:
            raise PluginError("Plugin not found.") from exc

    @classmethod
    def get_by_id(cls, plugin_id: UUID) -> Plugin:
        try:
            return cls._base_queryset().get(pk=plugin_id)
        except Plugin.DoesNotExist as exc:
            raise PluginError("Plugin not found.") from exc

    @staticmethod
    def get_for_mutation_by_id(plugin_id: UUID) -> Plugin:
        try:
            return Plugin.objects.select_related("category").get(pk=plugin_id)
        except Plugin.DoesNotExist as exc:
            raise PluginError("Plugin not found.") from exc

    @classmethod
    @transaction.atomic
    def create_plugin(cls, data: PluginCreateData) -> Plugin:
        name = cls._normalize_name(data.name)
        cls._validate_pricing(data.price, data.discount_price)
        status = cls._normalize_status(data.status)
        if status == Plugin.Status.PUBLISHED:
            raise PluginError(
                "Create as draft, upload a package file, then publish.",
                field="status",
            )
        currency = cls._normalize_currency(data.currency)
        cls._validate_currency_prices(currency, data.price, data.discount_price)
        plugin = Plugin.objects.create(
            category=cls._resolve_category(data.category_id),
            name=name,
            slug=Plugin.build_slug(name),
            description=data.description.strip(),
            short_description=data.short_description.strip(),
            price=data.price,
            currency=currency,
            discount_price=data.discount_price,
            thumbnail=data.thumbnail.strip(),
            version=cls._normalize_version(data.version),
            compatibility=data.compatibility.strip(),
            documentation_url=data.documentation_url.strip(),
            license_type=cls._normalize_license(data.license_type),
            status=status,
        )
        enqueue_sync_plugin(plugin.pk)
        return plugin

    @classmethod
    @transaction.atomic
    def update_plugin(cls, plugin: Plugin, data: PluginUpdateData) -> Plugin:
        plugin = Plugin.objects.select_for_update().get(pk=plugin.pk)
        update_fields: list[str] = ["updated_at"]
        if data.category_id is not None:
            plugin.category = cls._resolve_category(data.category_id)
            update_fields.append("category")
        if data.name is not None:
            plugin.name = cls._normalize_name(data.name)
            plugin.slug = Plugin.build_slug(plugin.name, exclude_id=plugin.pk)
            update_fields.extend(["name", "slug"])
        elif data.slug is not None:
            slug = data.slug.strip().lower()
            if not slug:
                raise PluginError("Slug cannot be empty.", field="slug")
            if Plugin.objects.filter(slug=slug).exclude(pk=plugin.pk).exists():
                raise PluginError("A plugin with this slug already exists.", field="slug")
            plugin.slug = slug
            update_fields.append("slug")
        for field_name in (
            "description",
            "short_description",
            "thumbnail",
            "compatibility",
            "documentation_url",
        ):
            value = getattr(data, field_name)
            if value is not None:
                setattr(plugin, field_name, value.strip())
                update_fields.append(field_name)
        price = plugin.price if data.price is None else data.price
        discount = (
            None
            if data.clear_discount_price
            else data.discount_price
            if data.discount_price is not None
            else plugin.discount_price
        )
        if data.price is not None or data.discount_price is not None or data.clear_discount_price:
            cls._validate_pricing(price, discount)
            plugin.price = price
            plugin.discount_price = discount
            update_fields.extend(["price", "discount_price"])
        if data.currency is not None:
            plugin.currency = cls._normalize_currency(data.currency)
            update_fields.append("currency")
        if data.version is not None:
            plugin.version = cls._normalize_version(data.version)
            update_fields.append("version")
        if data.license_type is not None:
            plugin.license_type = cls._normalize_license(data.license_type)
            update_fields.append("license_type")
        if data.status is not None:
            new_status = cls._normalize_status(data.status)
            plugin.status = new_status
            update_fields.append("status")
        cls._validate_currency_prices(plugin.currency, plugin.price, plugin.discount_price)
        if plugin.status == Plugin.Status.PUBLISHED:
            cls._validate_publish_ready(plugin)
        plugin.save(update_fields=list(dict.fromkeys(update_fields)))
        updated = cls.get_by_id(plugin.pk)
        enqueue_sync_plugin(updated.pk)
        return updated

    @classmethod
    def archive_plugin(cls, plugin: Plugin) -> Plugin:
        return cls.update_plugin(
            plugin,
            PluginUpdateData(status=Plugin.Status.ARCHIVED),
        )

    @classmethod
    @transaction.atomic
    def add_image(
        cls,
        plugin: Plugin,
        validated: ValidatedProductImageUpload,
        *,
        display_order: int = 0,
        is_primary: bool = False,
    ) -> PluginImage:
        image_url = PluginMediaStorageService.save_image(
            str(plugin.pk),
            validated.file,
            validated.extension,
        )
        if is_primary:
            PluginImage.objects.filter(plugin=plugin, is_primary=True).update(
                is_primary=False
            )
        image = PluginImage.objects.create(
            plugin=plugin,
            image_url=image_url,
            display_order=display_order,
            is_primary=is_primary,
        )
        if is_primary or not plugin.thumbnail:
            plugin.thumbnail = image_url
            plugin.save(update_fields=["thumbnail", "updated_at"])
        return image

    @classmethod
    @transaction.atomic
    def delete_image(cls, plugin: Plugin, image_id: UUID) -> None:
        try:
            image = PluginImage.objects.get(pk=image_id, plugin=plugin)
        except PluginImage.DoesNotExist as exc:
            raise PluginError("Plugin image not found.") from exc
        image_url = image.image_url
        was_primary = image.is_primary
        image.delete()
        PluginMediaStorageService.delete_if_managed(
            image_url,
            prefix=PluginMediaStorageService.IMAGE_PREFIX,
        )
        if was_primary or plugin.thumbnail == image_url:
            replacement = plugin.images.order_by("display_order", "created_at").first()
            plugin.thumbnail = replacement.image_url if replacement else ""
            if replacement and not replacement.is_primary:
                plugin.images.update(is_primary=False)
                replacement.is_primary = True
                replacement.save(update_fields=["is_primary", "updated_at"])
            plugin.save(update_fields=["thumbnail", "updated_at"])

    @classmethod
    @transaction.atomic
    def add_file(
        cls,
        plugin: Plugin,
        validated: ValidatedPluginFileUpload,
        *,
        version: str,
        is_primary: bool = False,
    ) -> PluginFile:
        storage_path = PluginMediaStorageService.save_file(
            str(plugin.pk),
            validated.file,
            validated.extension,
        )
        if is_primary:
            PluginFile.objects.filter(plugin=plugin, is_primary=True).update(
                is_primary=False
            )
        return PluginFile.objects.create(
            plugin=plugin,
            file_name=Path(validated.file.name.replace("\\", "/")).name,
            file_format=validated.file_format,
            file_size=validated.file.size or 0,
            storage_path=storage_path,
            version=cls._normalize_version(version),
            is_primary=is_primary,
        )

    @classmethod
    @transaction.atomic
    def delete_file(cls, plugin: Plugin, file_id: UUID) -> None:
        try:
            plugin_file = PluginFile.objects.get(pk=file_id, plugin=plugin)
        except PluginFile.DoesNotExist as exc:
            raise PluginError("Plugin file not found.") from exc
        storage_path = plugin_file.storage_path
        plugin_file.delete()
        PluginMediaStorageService.delete_if_managed(
            storage_path,
            prefix=PluginMediaStorageService.FILE_PREFIX,
        )

    @staticmethod
    def _resolve_category(category_id: UUID) -> PluginCategory:
        try:
            return PluginCategory.objects.get(pk=category_id, is_active=True)
        except PluginCategory.DoesNotExist as exc:
            raise PluginError(
                "Plugin category not found or inactive.",
                field="category_id",
            ) from exc

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized = name.strip()
        if len(normalized) < 2:
            raise PluginError("Name must be at least 2 characters.", field="name")
        return normalized

    @staticmethod
    def _normalize_currency(currency: str) -> str:
        try:
            return normalize_currency(currency)
        except ValueError as exc:
            raise PluginError(str(exc), field='currency') from exc

    @staticmethod
    def _validate_currency_prices(currency, price, discount):
        try:
            validate_catalog_prices(currency, price, discount)
        except ValueError as exc:
            raise PluginError(str(exc), field='price') from exc

    @staticmethod
    def _normalize_version(version: str) -> str:
        normalized = version.strip()
        if not normalized:
            raise PluginError("Version cannot be empty.", field="version")
        return normalized

    @staticmethod
    def _validate_pricing(price: Decimal, discount: Decimal | None) -> None:
        if price < Decimal("0.00"):
            raise PluginError("Price cannot be negative.", field="price")
        if discount is not None and discount > price:
            raise PluginError(
                "Discount price cannot exceed price.",
                field="discount_price",
            )

    @staticmethod
    def _normalize_license(license_type: str) -> str:
        if license_type not in {choice.value for choice in Plugin.LicenseType}:
            raise PluginError("Invalid license type.", field="license_type")
        return license_type

    @staticmethod
    def _normalize_status(status: str) -> str:
        if status not in {choice.value for choice in Plugin.Status}:
            raise PluginError("Invalid status.", field="status")
        return status

    @classmethod
    def _validate_publish_ready(cls, plugin: Plugin) -> None:
        """Require a resolvable private package before draft → published."""
        cls._validate_currency_prices(plugin.currency, plugin.price, plugin.discount_price)
        files = list(
            PluginFile.objects.filter(plugin=plugin).only("storage_path")
        )
        if not files:
            raise PluginError(
                "At least one plugin package file is required before publish.",
                field="files",
            )
        if not any(private_object_exists(row.storage_path) for row in files):
            raise PluginError(
                "Plugin package object is missing from private storage. "
                "Upload the package before publish.",
                field="files",
            )

    @staticmethod
    def _resolve_ordering(ordering: str | None) -> str:
        allowed = {
            "name",
            "-name",
            "price",
            "-price",
            "created_at",
            "-created_at",
        }
        return ordering if ordering in allowed else "-created_at"
