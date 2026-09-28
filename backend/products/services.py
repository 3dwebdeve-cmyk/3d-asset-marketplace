from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.db.models import Prefetch, Q, QuerySet
from django.utils import timezone

from categories.models import Category
from config.media import private_object_exists
from products.models import PRODUCT_SKU_REGEX, Product, ProductFile, ProductImage
from products.storage import ProductMediaStorageService
from products.upload_rules import (
    validate_product_file_upload,
    validate_product_image_upload,
)
from search.tasks import enqueue_sync_product


class ProductError(Exception):
    def __init__(
        self,
        message: str,
        field: str | None = None,
        *,
        errors: dict[str, list[str]] | None = None,
    ) -> None:
        self.message = message
        self.field = field
        self.errors = errors
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
    sku: str | None = None
    import_batch_id: str = ""
    import_source: str = ""
    glb_checksum: str = ""
    has_thumbnail: bool = False
    has_preview: bool = False
    has_package: bool = False


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
    sku: str | None = None
    clear_sku: bool = False
    import_batch_id: str | None = None
    import_source: str | None = None
    glb_checksum: str | None = None
    has_thumbnail: bool | None = None
    has_preview: bool | None = None
    has_package: bool | None = None


class ProductService:
    @classmethod
    def _base_queryset(cls) -> QuerySet[Product]:
        return Product.objects.select_related("category", "reviewed_by").prefetch_related(
            Prefetch("images", queryset=ProductImage.objects.order_by("display_order")),
            Prefetch("files", queryset=ProductFile.objects.order_by("-is_preview")),
        )

    @classmethod
    def _normalize_search(cls, search: str | None) -> str | None:
        from search.services import normalize_query

        return normalize_query(search)

    @classmethod
    def list_public(
        cls,
        *,
        category_id: UUID | None = None,
        search: str | None = None,
        ordering: str | None = None,
        animated: bool | None = None,
        rigged: bool | None = None,
        pbr_ready: bool | None = None,
        game_ready: bool | None = None,
    ) -> QuerySet[Product]:
        # Public list responses do not serialize images or files.
        # Defer heavy detail/admin-only columns to shrink list payload SQL.
        queryset = (
            Product.objects.select_related("category")
            .filter(status=Product.Status.PUBLISHED)
            .defer(
                "description",
                "preview_model",
                "preview_video",
                "polygon_count",
                "vertex_count",
                "animated",
                "rigged",
                "pbr_ready",
                "game_ready",
                "sku",
                "import_batch_id",
                "import_source",
                "glb_checksum",
                "has_thumbnail",
                "has_preview",
                "has_package",
                "reject_reason",
                "qa_notes",
                "reviewed_at",
                "reviewed_by",
                "status",
            )
        )

        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        query = cls._normalize_search(search)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(short_description__icontains=query)
                | Q(software_used__icontains=query)
            )

        if animated is not None:
            queryset = queryset.filter(animated=animated)
        if rigged is not None:
            queryset = queryset.filter(rigged=rigged)
        if pbr_ready is not None:
            queryset = queryset.filter(pbr_ready=pbr_ready)
        if game_ready is not None:
            queryset = queryset.filter(game_ready=game_ready)

        return queryset.order_by(cls._resolve_ordering(ordering))

    @classmethod
    def list_admin(
        cls,
        *,
        status: str | None = None,
        category_id: UUID | None = None,
        search: str | None = None,
        sku: str | None = None,
        import_batch_id: str | None = None,
        ordering: str | None = None,
    ) -> QuerySet[Product]:
        # Admin list serializers include nested media; keep prefetch.
        queryset = cls._base_queryset()

        if status is not None:
            queryset = queryset.filter(status=status)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        normalized_sku = Product.normalize_sku(sku)
        if normalized_sku is not None:
            queryset = queryset.filter(sku=normalized_sku)
        if import_batch_id:
            batch = import_batch_id.strip()
            if batch:
                queryset = queryset.filter(import_batch_id=batch)
        query = cls._normalize_search(search)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(short_description__icontains=query)
                | Q(slug__icontains=query)
                | Q(sku__icontains=query)
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
    def get_by_sku(cls, sku: str) -> Product:
        """Lookup by Model_ID / SKU for batch upsert (idempotent re-import)."""
        normalized = cls._require_sku(sku)
        try:
            return cls._base_queryset().get(sku=normalized)
        except Product.DoesNotExist as exc:
            raise ProductError("Product not found.", field="sku") from exc

    @classmethod
    def _require_sku(cls, value: str | None) -> str:
        normalized = Product.normalize_sku(value)
        if normalized is None:
            raise ProductError("SKU is required.", field="sku")
        if not PRODUCT_SKU_REGEX.fullmatch(normalized):
            raise ProductError(
                "SKU may only contain uppercase letters, digits, hyphens, and "
                "underscores, and must start with a letter or digit.",
                field="sku",
            )
        return normalized

    @classmethod
    def _validate_sku_unique(
        cls,
        sku: str | None,
        *,
        exclude_id: UUID | None = None,
    ) -> str | None:
        if sku is None:
            return None
        normalized = cls._require_sku(sku)
        queryset = Product.objects.filter(sku=normalized)
        if exclude_id is not None:
            queryset = queryset.exclude(pk=exclude_id)
        if queryset.exists():
            raise ProductError(
                "A product with this SKU already exists.",
                field="sku",
            )
        return normalized

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
        sku = cls._validate_sku_unique(data.sku)
        import_batch_id = data.import_batch_id.strip()[:64]
        if status == Product.Status.PUBLISHED and import_batch_id:
            raise ProductError(
                "Imported products must be published via the approve endpoint.",
                field="status",
            )

        product = Product.objects.create(
            category=category,
            name=name,
            slug=Product.build_slug(name),
            sku=sku,
            import_batch_id=import_batch_id,
            import_source=data.import_source.strip()[:64],
            glb_checksum=data.glb_checksum.strip()[:64],
            has_thumbnail=data.has_thumbnail,
            has_preview=data.has_preview,
            has_package=data.has_package,
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
        enqueue_sync_product(product.pk)
        return product

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
            new_status = cls._normalize_status(data.status)
            cls._validate_status_transition(product.status, new_status)
            # Imported batch rows must use the dedicated approve endpoint to publish.
            if (
                new_status == Product.Status.PUBLISHED
                and product.import_batch_id.strip()
            ):
                raise ProductError(
                    "Imported products must be published via the approve endpoint.",
                    field="status",
                )
            product.status = new_status
            update_fields.append("status")

        if data.clear_sku:
            product.sku = None
            update_fields.append("sku")
        elif data.sku is not None:
            product.sku = cls._validate_sku_unique(data.sku, exclude_id=product.pk)
            update_fields.append("sku")

        if data.import_batch_id is not None:
            product.import_batch_id = data.import_batch_id.strip()[:64]
            update_fields.append("import_batch_id")

        if data.import_source is not None:
            product.import_source = data.import_source.strip()[:64]
            update_fields.append("import_source")

        if data.glb_checksum is not None:
            product.glb_checksum = data.glb_checksum.strip()[:64]
            update_fields.append("glb_checksum")

        for field_name in ("has_thumbnail", "has_preview", "has_package"):
            value = getattr(data, field_name)
            if value is not None:
                setattr(product, field_name, value)
                update_fields.append(field_name)

        product.save(update_fields=list(dict.fromkeys(update_fields)))
        updated = cls.get_by_id(product.pk)
        enqueue_sync_product(updated.pk)
        return updated

    @classmethod
    @transaction.atomic
    def archive_product(cls, product: Product) -> Product:
        return cls.update_product(
            product,
            ProductUpdateData(status=Product.Status.ARCHIVED),
        )

    @classmethod
    def _validate_publish_ready(cls, product: Product) -> None:
        """Conservative publish gates for the QA approve path (Feature 16 Phase 8).

        Aligned with docs/batch-ingest-contract.md sellability needs: identity,
        pricing, category, web preview, and at least one paid package file.
        Manual draft→published via admin create/PATCH is unchanged.
        """
        errors: dict[str, list[str]] = {}

        if not product.sku:
            errors["sku"] = ["SKU is required before publish."]

        name = (product.name or "").strip()
        if len(name) < 2:
            errors["name"] = ["Name must be at least 2 characters."]

        if product.category_id is None:
            errors["category"] = ["Category is required before publish."]
        elif not Category.objects.filter(pk=product.category_id, is_active=True).exists():
            errors["category"] = ["Category not found or inactive."]

        if product.price is None or product.price < Decimal("0.00"):
            errors["price"] = ["A valid non-negative price is required."]

        sellable_files = list(
            ProductFile.objects.filter(
                product=product,
                is_preview=False,
            ).only("storage_path")
        )
        if not sellable_files:
            errors["files"] = [
                "At least one sellable package file is required before publish."
            ]
        elif not any(private_object_exists(row.storage_path) for row in sellable_files):
            errors["files"] = [
                "Sellable package object is missing from private storage. "
                "Upload or migrate the package before publish."
            ]

        if not (product.preview_model or "").strip():
            errors["preview_model"] = ["Preview model is required before publish."]

        if errors:
            raise ProductError(
                "Product is not ready to publish.",
                errors=errors,
            )

    @classmethod
    @transaction.atomic
    def approve_product(cls, product: Product, *, reviewer) -> Product:
        """pending_review → published with publish gates. Clears reject_reason."""
        if product.status != Product.Status.PENDING_REVIEW:
            raise ProductError(
                f"Cannot approve product with status '{product.status}'.",
                field="status",
            )
        cls._validate_status_transition(product.status, Product.Status.PUBLISHED)
        cls._validate_publish_ready(product)

        product.status = Product.Status.PUBLISHED
        product.reviewed_at = timezone.now()
        product.reviewed_by = reviewer
        # Clear prior rejection text on approve; qa_notes retained for audit.
        product.reject_reason = ""
        product.save(
            update_fields=[
                "status",
                "reviewed_at",
                "reviewed_by",
                "reject_reason",
                "updated_at",
            ]
        )
        approved = cls.get_by_id(product.pk)
        enqueue_sync_product(approved.pk)
        return approved

    @classmethod
    @transaction.atomic
    def reject_product(
        cls,
        product: Product,
        *,
        reviewer,
        reason: str,
        qa_notes: str | None = None,
    ) -> Product:
        """pending_review → rejected. Stores reject_reason + review metadata."""
        if product.status != Product.Status.PENDING_REVIEW:
            raise ProductError(
                f"Cannot reject product with status '{product.status}'.",
                field="status",
            )
        normalized_reason = reason.strip()
        if not normalized_reason:
            raise ProductError("Reject reason is required.", field="reason")

        cls._validate_status_transition(product.status, Product.Status.REJECTED)

        product.status = Product.Status.REJECTED
        product.reject_reason = normalized_reason
        product.reviewed_at = timezone.now()
        product.reviewed_by = reviewer
        update_fields = [
            "status",
            "reject_reason",
            "reviewed_at",
            "reviewed_by",
            "updated_at",
        ]
        if qa_notes is not None:
            product.qa_notes = qa_notes.strip()
            update_fields.append("qa_notes")
        product.save(update_fields=update_fields)
        rejected = cls.get_by_id(product.pk)
        enqueue_sync_product(rejected.pk)
        return rejected

    @classmethod
    @transaction.atomic
    def requeue_product(cls, product: Product) -> Product:
        """rejected → pending_review. Keeps reject_reason until next reject/approve."""
        if product.status != Product.Status.REJECTED:
            raise ProductError(
                f"Cannot requeue product with status '{product.status}'.",
                field="status",
            )
        cls._validate_status_transition(product.status, Product.Status.PENDING_REVIEW)
        product.status = Product.Status.PENDING_REVIEW
        product.save(update_fields=["status", "updated_at"])
        requeued = cls.get_by_id(product.pk)
        enqueue_sync_product(requeued.pk)
        return requeued

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
            "total_downloads",
            "-total_downloads",
            "review_count",
            "-review_count",
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

    @classmethod
    def _validate_status_transition(cls, current: str, new_status: str) -> None:
        if current == new_status:
            return
        allowed: dict[str, set[str]] = {
            Product.Status.DRAFT: {
                Product.Status.PENDING_REVIEW,
                Product.Status.PUBLISHED,
                Product.Status.REJECTED,
                Product.Status.ARCHIVED,
            },
            Product.Status.PENDING_REVIEW: {
                Product.Status.DRAFT,
                Product.Status.PUBLISHED,
                Product.Status.REJECTED,
                Product.Status.ARCHIVED,
            },
            Product.Status.PUBLISHED: {
                Product.Status.DRAFT,
                Product.Status.ARCHIVED,
            },
            Product.Status.REJECTED: {
                Product.Status.DRAFT,
                Product.Status.PENDING_REVIEW,
                Product.Status.ARCHIVED,
            },
            Product.Status.ARCHIVED: {
                Product.Status.DRAFT,
            },
        }
        next_statuses = allowed.get(current, set())
        if new_status not in next_statuses:
            raise ProductError(
                f"Cannot change status from '{current}' to '{new_status}'.",
                field="status",
            )
