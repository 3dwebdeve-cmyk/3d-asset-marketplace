from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.db.models import Prefetch, Q, QuerySet

from categories.models import Category
from products.models import Product, ProductFile, ProductImage
from products.storage import ProductMediaStorageService
from products.upload_rules import (
    validate_product_file_upload,
    validate_product_image_upload,
)


class ProductError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


@dataclass(frozen=True)
class ProductCreateData:
    category_id: UUID
    name: str
    price: Decimal
    description: str = ""
    short_description: str = ""
    currency: str = "USD"
    discount_price: Decimal | None = None
    thumbnail: str = ""
    preview_model: str = ""
    preview_video: str = ""
    polygon_count: int | None = None
    vertex_count: int | None = None
    software_used: str = ""
    animated: bool = False
    rigged: bool = False
    pbr_ready: bool = False
    game_ready: bool = False
    license_type: str = Product.LicenseType.STANDARD
    status: str = Product.Status.DRAFT


@dataclass(frozen=True)
class ProductUpdateData:
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
    preview_model: str | None = None
    preview_video: str | None = None
    polygon_count: int | None = None
    clear_polygon_count: bool = False
    vertex_count: int | None = None
    clear_vertex_count: bool = False
    software_used: str | None = None
    animated: bool | None = None
    rigged: bool | None = None
    pbr_ready: bool | None = None
    game_ready: bool | None = None
    license_type: str | None = None
    status: str | None = None


class ProductService:
    @classmethod
    def _base_queryset(cls) -> QuerySet[Product]:
        return Product.objects.select_related("category").prefetch_related(
            Prefetch("images", queryset=ProductImage.objects.order_by("display_order")),
            Prefetch("files", queryset=ProductFile.objects.order_by("-is_preview")),
        )

    @classmethod
    def _normalize_search(cls, search: str | None) -> str | None:
        if not search:
            return None
        query = search.strip()
        if not query:
            return None
        return query[:100]

    @classmethod
    def list_public(
        cls,
        *,
        category_id: UUID | None = None,
        search: str | None = None,
        ordering: str | None = None,
    ) -> QuerySet[Product]:
        # Public list responses do not serialize images or files.
        queryset = Product.objects.select_related("category").filter(
            status=Product.Status.PUBLISHED
        )

        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        query = cls._normalize_search(search)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(short_description__icontains=query)
            )

        return queryset.order_by(cls._resolve_ordering(ordering))

    @classmethod
    def list_admin(
        cls,
        *,
        status: str | None = None,
        category_id: UUID | None = None,
        search: str | None = None,
        ordering: str | None = None,
    ) -> QuerySet[Product]:
        # Admin list serializers include nested media; keep prefetch.
        queryset = cls._base_queryset()

        if status is not None:
            queryset = queryset.filter(status=status)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        query = cls._normalize_search(search)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(short_description__icontains=query)
                | Q(slug__icontains=query)
            )

        return queryset.order_by(cls._resolve_ordering(ordering))

    @classmethod
    def get_public_by_slug(cls, slug: str) -> Product:
        try:
            return cls._base_queryset().get(
                slug=slug.strip(),
                status=Product.Status.PUBLISHED,
            )
        except Product.DoesNotExist as exc:
            raise ProductError("Product not found.") from exc

    @classmethod
    def get_by_id(cls, product_id: UUID) -> Product:
        try:
            return cls._base_queryset().get(pk=product_id)
        except Product.DoesNotExist as exc:
            raise ProductError("Product not found.") from exc

    @classmethod
    @transaction.atomic
    def create_product(cls, data: ProductCreateData) -> Product:
        name = data.name.strip()
        if len(name) < 2:
            raise ProductError("Name must be at least 2 characters.", field="name")

        category = cls._resolve_category(data.category_id)
        cls._validate_pricing(data.price, data.discount_price)
        currency = cls._normalize_currency(data.currency)
        license_type = cls._normalize_license(data.license_type)
        status = cls._normalize_status(data.status)

        return Product.objects.create(
            category=category,
            name=name,
            slug=Product.build_slug(name),
            description=data.description.strip(),
            short_description=data.short_description.strip(),
            price=data.price,
            currency=currency,
            discount_price=data.discount_price,
            thumbnail=data.thumbnail.strip(),
            preview_model=data.preview_model.strip(),
            preview_video=data.preview_video.strip(),
            polygon_count=data.polygon_count,
            vertex_count=data.vertex_count,
            software_used=data.software_used.strip(),
            animated=data.animated,
            rigged=data.rigged,
            pbr_ready=data.pbr_ready,
            game_ready=data.game_ready,
            license_type=license_type,
            status=status,
        )

    @classmethod
    @transaction.atomic
    def update_product(cls, product: Product, data: ProductUpdateData) -> Product:
        update_fields: list[str] = ["updated_at"]

        if data.category_id is not None:
            product.category = cls._resolve_category(data.category_id)
            update_fields.append("category")

        if data.name is not None:
            name = data.name.strip()
            if len(name) < 2:
                raise ProductError("Name must be at least 2 characters.", field="name")
            product.name = name
            product.slug = Product.build_slug(name, exclude_id=product.pk)
            update_fields.extend(["name", "slug"])

        if data.slug is not None and data.name is None:
            slug = data.slug.strip().lower()
            if not slug:
                raise ProductError("Slug cannot be empty.", field="slug")
            if Product.objects.filter(slug=slug).exclude(pk=product.pk).exists():
                raise ProductError(
                    "A product with this slug already exists.",
                    field="slug",
                )
            product.slug = slug
            update_fields.append("slug")

        if data.description is not None:
            product.description = data.description.strip()
            update_fields.append("description")

        if data.short_description is not None:
            product.short_description = data.short_description.strip()
            update_fields.append("short_description")

        price = product.price if data.price is None else data.price
        if data.clear_discount_price:
            discount_price: Decimal | None = None
        elif data.discount_price is not None:
            discount_price = data.discount_price
        else:
            discount_price = product.discount_price

        if data.price is not None or data.discount_price is not None or data.clear_discount_price:
            cls._validate_pricing(price, discount_price)
            if data.price is not None:
                product.price = data.price
                update_fields.append("price")
            if data.discount_price is not None or data.clear_discount_price:
                product.discount_price = discount_price
                update_fields.append("discount_price")

        if data.currency is not None:
            product.currency = cls._normalize_currency(data.currency)
            update_fields.append("currency")

        if data.thumbnail is not None:
            product.thumbnail = data.thumbnail.strip()
            update_fields.append("thumbnail")

        if data.preview_model is not None:
            product.preview_model = data.preview_model.strip()
            update_fields.append("preview_model")

        if data.preview_video is not None:
            product.preview_video = data.preview_video.strip()
            update_fields.append("preview_video")

        if data.clear_polygon_count:
            product.polygon_count = None
            update_fields.append("polygon_count")
        elif data.polygon_count is not None:
            product.polygon_count = data.polygon_count
            update_fields.append("polygon_count")

        if data.clear_vertex_count:
            product.vertex_count = None
            update_fields.append("vertex_count")
        elif data.vertex_count is not None:
            product.vertex_count = data.vertex_count
            update_fields.append("vertex_count")

        if data.software_used is not None:
            product.software_used = data.software_used.strip()
            update_fields.append("software_used")

        for field_name in ("animated", "rigged", "pbr_ready", "game_ready"):
            value = getattr(data, field_name)
            if value is not None:
                setattr(product, field_name, value)
                update_fields.append(field_name)

        if data.license_type is not None:
            product.license_type = cls._normalize_license(data.license_type)
            update_fields.append("license_type")

        if data.status is not None:
            product.status = cls._normalize_status(data.status)
            update_fields.append("status")

        product.save(update_fields=list(dict.fromkeys(update_fields)))
        return cls.get_by_id(product.pk)

    @classmethod
    @transaction.atomic
    def archive_product(cls, product: Product) -> Product:
        return cls.update_product(
            product,
            ProductUpdateData(status=Product.Status.ARCHIVED),
        )

    @classmethod
    @transaction.atomic
    def add_image(
        cls,
        product: Product,
        uploaded: UploadedFile,
        *,
        display_order: int = 0,
        is_primary: bool = False,
    ) -> ProductImage:
        validated = validate_product_image_upload(uploaded)
        image_url = ProductMediaStorageService.save_image(
            str(product.pk),
            validated.file,
            validated.extension,
        )

        if is_primary:
            ProductImage.objects.filter(product=product, is_primary=True).update(
                is_primary=False
            )

        image = ProductImage.objects.create(
            product=product,
            image_url=image_url,
            display_order=display_order,
            is_primary=is_primary,
        )

        if is_primary or not product.thumbnail:
            product.thumbnail = image_url
            product.save(update_fields=["thumbnail", "updated_at"])

        return image

    @classmethod
    @transaction.atomic
    def delete_image(cls, product: Product, image_id: UUID) -> None:
        try:
            image = ProductImage.objects.get(pk=image_id, product=product)
        except ProductImage.DoesNotExist as exc:
            raise ProductError("Product image not found.") from exc

        image_url = image.image_url
        was_primary = image.is_primary
        image.delete()
        ProductMediaStorageService.delete_if_managed(
            image_url,
            prefix=ProductMediaStorageService.IMAGE_PREFIX,
        )

        if was_primary or product.thumbnail == image_url:
            replacement = (
                ProductImage.objects.filter(product=product)
                .order_by("display_order", "created_at")
                .first()
            )
            product.thumbnail = replacement.image_url if replacement else ""
            if replacement and not replacement.is_primary:
                ProductImage.objects.filter(product=product).update(is_primary=False)
                replacement.is_primary = True
                replacement.save(update_fields=["is_primary", "updated_at"])
            product.save(update_fields=["thumbnail", "updated_at"])

    @classmethod
    @transaction.atomic
    def add_file(
        cls,
        product: Product,
        uploaded: UploadedFile,
        *,
        version: str = "1.0",
        is_preview: bool = False,
    ) -> ProductFile:
        validated = validate_product_file_upload(uploaded)
        # GLB/glTF uploads always become the interactive public preview.
        use_public_preview = validated.file_format in {"glb", "gltf"}
        effective_is_preview = True if use_public_preview else is_preview
        if use_public_preview:
            storage_path = ProductMediaStorageService.save_preview(
                str(product.pk),
                validated.file,
                validated.extension,
            )
        else:
            storage_path = ProductMediaStorageService.save_file(
                str(product.pk),
                validated.file,
                validated.extension,
            )
        file_name = Path(uploaded.name).name if uploaded.name else f"asset{validated.extension}"

        product_file = ProductFile.objects.create(
            product=product,
            file_name=file_name,
            file_format=validated.file_format,
            file_size=uploaded.size or 0,
            storage_path=storage_path,
            version=version.strip() or "1.0",
            is_preview=effective_is_preview,
        )

        if use_public_preview:
            product.preview_model = storage_path
            product.save(update_fields=["preview_model", "updated_at"])

        return product_file

    @classmethod
    @transaction.atomic
    def delete_file(cls, product: Product, file_id: UUID) -> None:
        try:
            product_file = ProductFile.objects.get(pk=file_id, product=product)
        except ProductFile.DoesNotExist as exc:
            raise ProductError("Product file not found.") from exc

        storage_path = product_file.storage_path
        was_preview = product_file.is_preview
        product_file.delete()
        # Preview GLBs live under products/previews/; packages under products/files/.
        ProductMediaStorageService.delete_if_managed(
            storage_path,
            prefix=ProductMediaStorageService.PREVIEW_PREFIX,
        )
        ProductMediaStorageService.delete_if_managed(
            storage_path,
            prefix=ProductMediaStorageService.FILE_PREFIX,
        )

        if was_preview and product.preview_model == storage_path:
            replacement = (
                ProductFile.objects.filter(
                    product=product,
                    is_preview=True,
                    file_format__in=["glb", "gltf"],
                )
                .order_by("created_at")
                .first()
            )
            product.preview_model = replacement.storage_path if replacement else ""
            product.save(update_fields=["preview_model", "updated_at"])

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
        if ordering and ordering in allowed:
            return ordering
        return "-created_at"

    @classmethod
    def _resolve_category(cls, category_id: UUID) -> Category:
        try:
            return Category.objects.get(pk=category_id, is_active=True)
        except Category.DoesNotExist as exc:
            raise ProductError(
                "Category not found or inactive.",
                field="category_id",
            ) from exc

    @staticmethod
    def _validate_pricing(price: Decimal, discount_price: Decimal | None) -> None:
        if price < Decimal("0.00"):
            raise ProductError("Price cannot be negative.", field="price")
        if discount_price is not None:
            if discount_price < Decimal("0.00"):
                raise ProductError(
                    "Discount price cannot be negative.",
                    field="discount_price",
                )
            if discount_price > price:
                raise ProductError(
                    "Discount price cannot exceed price.",
                    field="discount_price",
                )

    @staticmethod
    def _normalize_currency(currency: str) -> str:
        normalized = currency.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ProductError(
                "Currency must be a 3-letter ISO code.",
                field="currency",
            )
        return normalized

    @staticmethod
    def _normalize_license(license_type: str) -> str:
        allowed = {choice.value for choice in Product.LicenseType}
        if license_type not in allowed:
            raise ProductError("Invalid license type.", field="license_type")
        return license_type

    @staticmethod
    def _normalize_status(status: str) -> str:
        allowed = {choice.value for choice in Product.Status}
        if status not in allowed:
            raise ProductError("Invalid status.", field="status")
        return status
