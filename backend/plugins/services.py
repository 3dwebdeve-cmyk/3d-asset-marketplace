from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from django.db import transaction
from django.db.models import Prefetch, Q, QuerySet
from django.utils import timezone

from config.media import private_object_exists
from config.currency import normalize_currency, validate_catalog_prices
from plugins.models import Plugin, PluginCategory, PluginFile, PluginImage
from plugins.storage import PluginMediaStorageService
from plugins.upload_rules import ValidatedPluginFileUpload
from products.upload_rules import ValidatedProductImageUpload

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
    code: str = ""


@dataclass(frozen=True)
class PluginCategoryUpdateData:
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    image: str | None = None
    code: str | None = None
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

    @staticmethod
    def _check_code_free(code: str, *, exclude_id: UUID | None = None) -> None:
        taken = PluginCategory.objects.filter(code=code)
        if exclude_id is not None:
            taken = taken.exclude(pk=exclude_id)
        if taken.exists():
            raise PluginError(
                f"Category code {code} is already used by another category.",
                field="code",
            )

    @classmethod
    @transaction.atomic
    def create_category(cls, data: PluginCategoryCreateData) -> PluginCategory:
        name = cls._normalize_name(data.name)
        code = data.code.strip().upper() or None
        if code:
            cls._check_code_free(code)
        return PluginCategory.objects.create(
            name=name,
            slug=PluginCategory.build_slug(name),
            description=data.description.strip(),
            image=data.image.strip(),
            code=code,
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
        if data.slug is not None:
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
        if data.code is not None:
            # Blank clears the code. A code cannot change once the category has plugins,
            # because their IDs (PLG-<CODE>-...) were made from it.
            code = data.code.strip().upper() or None
            if code != category.code:
                if category.code and category.plugins.exists():
                    raise PluginError(
                        "This category already has plugins with IDs; its code cannot change.",
                        field="code",
                    )
                if code:
                    cls._check_code_free(code, exclude_id=category.pk)
                category.code = code
                update_fields.append("code")
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
    # Reached only through the importer and the review queue, never by a plain edit.
    REVIEW_ONLY_STATUSES = frozenset(
        {Plugin.Status.PENDING_REVIEW, Plugin.Status.REJECTED}
    )

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
            .prefetch_related(
                Prefetch(
                    "files",
                    queryset=PluginFile.objects.only("plugin_id", "file_format"),
                    to_attr="filter_files",
                )
            )
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
        if status == Plugin.Status.PENDING_REVIEW:
            # The review queue: new plugins, plus live plugins uploaded again (still on sale).
            queryset = queryset.filter(cls.awaiting_review_q())
        elif status is not None:
            queryset = queryset.filter(status=status)
        return cls._filter_list(
            queryset,
            category_id=category_id,
            search=search,
            ordering=ordering,
        )

    @staticmethod
    def awaiting_review_q() -> Q:
        """Plugins a reviewer must look at: pending review, or a live plugin's update."""
        return Q(status=Plugin.Status.PENDING_REVIEW) | Q(
            status=Plugin.Status.PUBLISHED, pending_update=True
        )

    @staticmethod
    def is_live_update(plugin: Plugin) -> bool:
        return plugin.status == Plugin.Status.PUBLISHED and plugin.pending_update

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
        if status in cls.REVIEW_ONLY_STATUSES:
            raise PluginError(
                "Review statuses are set by the importer and the review queue.",
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
        if data.slug is not None:
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
            if new_status != plugin.status:
                cls._validate_direct_status_change(plugin, new_status)
            plugin.status = new_status
            update_fields.append("status")
        cls._validate_currency_prices(plugin.currency, plugin.price, plugin.discount_price)
        if plugin.status == Plugin.Status.PUBLISHED:
            cls._validate_publish_ready(plugin)
        plugin.save(update_fields=list(dict.fromkeys(update_fields)))
        updated = cls.get_by_id(plugin.pk)
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

    @classmethod
    def _validate_direct_status_change(cls, plugin: Plugin, new_status: str) -> None:
        if new_status in cls.REVIEW_ONLY_STATUSES:
            raise PluginError(
                "Use the review queue to reject or requeue a plugin.",
                field="status",
            )
        # Imported plugins publish through approve so the reviewer and price are recorded.
        in_review_flow = (
            plugin.status in cls.REVIEW_ONLY_STATUSES or plugin.import_batch_id
        )
        if new_status == Plugin.Status.PUBLISHED and in_review_flow:
            raise PluginError(
                "Publish through the review queue so the reviewer is recorded.",
                field="status",
            )

    @classmethod
    def _validate_approve_ready(cls, plugin: Plugin) -> None:
        """Publish gates for the review queue: identity, category, content, package."""
        errors: dict[str, str] = {}
        if not plugin.plugin_id:
            errors["plugin_id"] = "Plugin ID is required before publish."
        if len((plugin.name or "").strip()) < 2:
            errors["name"] = "Name must be at least 2 characters."
        if not PluginCategory.objects.filter(
            pk=plugin.category_id, is_active=True
        ).exists():
            errors["category"] = "Category not found or inactive."
        if not (plugin.description or "").strip():
            errors["description"] = "Description is required before publish."
        if not (plugin.thumbnail or "").strip():
            errors["thumbnail"] = "Thumbnail is required before publish."
        try:
            cls._validate_publish_ready(plugin)
        except PluginError as exc:
            errors["files"] = exc.message
        if errors:
            raise PluginError(
                "Plugin is not ready to publish: "
                + "; ".join(f"{key}: {value}" for key, value in errors.items()),
                field=next(iter(errors)),
            )

    @classmethod
    @transaction.atomic
    def approve_plugin(
        cls,
        plugin: Plugin,
        *,
        reviewer,
        price: Decimal | None = None,
        currency: str | None = None,
        discount_price: Decimal | None = None,
        qa_notes: str | None = None,
    ) -> Plugin:
        """pending_review -> published. The reviewer sets the price; 0.00 means free.

        A live plugin's update (published + ``pending_update``) is approved the same way: it
        stays published and the flag is cleared. Without ``price`` it keeps its current price
        and discount.
        """
        plugin = Plugin.objects.select_for_update().get(pk=plugin.pk)
        live_update = cls.is_live_update(plugin)
        if plugin.status != Plugin.Status.PENDING_REVIEW and not live_update:
            raise PluginError(
                f"Cannot approve plugin with status '{plugin.status}'.",
                field="status",
            )
        if price is None:
            if not live_update:
                raise PluginError("Set the price (0 for a free plugin).", field="price")
            price, discount_price = plugin.price, plugin.discount_price
        if currency:
            plugin.currency = cls._normalize_currency(currency)
        cls._validate_pricing(price, discount_price)
        cls._validate_currency_prices(plugin.currency, price, discount_price)
        plugin.price = price
        plugin.discount_price = discount_price
        cls._validate_approve_ready(plugin)

        plugin.status = Plugin.Status.PUBLISHED
        plugin.pending_update = False
        plugin.reviewed_at = timezone.now()
        plugin.reviewed_by = reviewer
        # Clear prior rejection text on approve; qa_notes retained for audit.
        plugin.reject_reason = ""
        update_fields = [
            "status",
            "pending_update",
            "price",
            "discount_price",
            "currency",
            "reviewed_at",
            "reviewed_by",
            "reject_reason",
            "updated_at",
        ]
        if qa_notes is not None:
            plugin.qa_notes = qa_notes.strip()
            update_fields.append("qa_notes")
        plugin.save(update_fields=update_fields)
        return cls.get_by_id(plugin.pk)

    @classmethod
    @transaction.atomic
    def reject_plugin(
        cls,
        plugin: Plugin,
        *,
        reviewer,
        reason: str,
        qa_notes: str | None = None,
    ) -> Plugin:
        """pending_review -> rejected. Stores the reason and review metadata.

        Rejecting a live plugin's update takes the plugin off sale too (published -> rejected):
        its new files are already what the store serves, and they cannot be rolled back.
        Buyers keep their downloads (downloads follow the paid order, not the status).
        """
        plugin = Plugin.objects.select_for_update().get(pk=plugin.pk)
        if plugin.status != Plugin.Status.PENDING_REVIEW and not cls.is_live_update(plugin):
            raise PluginError(
                f"Cannot reject plugin with status '{plugin.status}'.",
                field="status",
            )
        normalized_reason = reason.strip()
        if not normalized_reason:
            raise PluginError("Reject reason is required.", field="reason")
        plugin.status = Plugin.Status.REJECTED
        plugin.pending_update = False
        plugin.reject_reason = normalized_reason
        plugin.reviewed_at = timezone.now()
        plugin.reviewed_by = reviewer
        update_fields = [
            "status",
            "pending_update",
            "reject_reason",
            "reviewed_at",
            "reviewed_by",
            "updated_at",
        ]
        if qa_notes is not None:
            plugin.qa_notes = qa_notes.strip()
            update_fields.append("qa_notes")
        plugin.save(update_fields=update_fields)
        return cls.get_by_id(plugin.pk)

    @classmethod
    @transaction.atomic
    def requeue_plugin(cls, plugin: Plugin) -> Plugin:
        """rejected -> pending_review. Keeps reject_reason until the next decision."""
        plugin = Plugin.objects.select_for_update().get(pk=plugin.pk)
        if plugin.status != Plugin.Status.REJECTED:
            raise PluginError(
                f"Cannot requeue plugin with status '{plugin.status}'.",
                field="status",
            )
        plugin.status = Plugin.Status.PENDING_REVIEW
        plugin.save(update_fields=["status", "updated_at"])
        return cls.get_by_id(plugin.pk)

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
