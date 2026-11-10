from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from django.db import transaction
from django.db.models import Exists, OuterRef, Prefetch, Q, QuerySet
from django.utils import timezone

from categories.models import Category
from config.media import FREE_MODELS_PREFIX, is_free_model_path, package_object_exists
from config.currency import (
    normalize_currency,
    validate_catalog_prices,
)
from products.errors import ProductError
from products.media_service import (  # noqa: F401 - re-exported for existing imports
    PREVIEW_MAX_POLYGON_SHARE,
    ProductMediaService,
    preview_reduction_error,
)
from products.models import (
    PRODUCT_SKU_REGEX,
    Product,
    ProductFile,
    ProductImage,
    ProductPriceChange,
)
from products.price_history import PriceState, record_price_change

# Upload kind (docs/PRICING_PIPELINE.md): a model whose sellable zip is under free-models/
# is free; any other model is paid.
UPLOAD_KIND_FREE = "free"
UPLOAD_KIND_PAID = "paid"
UPLOAD_KINDS = frozenset({UPLOAD_KIND_FREE, UPLOAD_KIND_PAID})


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
    package_formats: list[str] = field(default_factory=list)


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
    # When the sale ends (time-zone aware, in the future). Clearing the sale price clears it.
    discount_ends_at: datetime | None = None
    clear_discount_ends_at: bool = False
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
    package_formats: list[str] | None = None


class ProductService(ProductMediaService):
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
            .prefetch_related(
                Prefetch(
                    "files",
                    queryset=ProductFile.objects.only("product_id", "file_format"),
                    to_attr="filter_files",
                )
            )
            .filter(status=Product.Status.PUBLISHED, category__is_active=True)
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
            # A parent category also lists its active subcategories' products;
            # a subcategory lists only its own.
            queryset = queryset.filter(
                Q(category_id=category_id)
                | Q(category__parent_id=category_id, category__is_active=True)
            )
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
        kind: str | None = None,
    ) -> QuerySet[Product]:
        # Admin list serializers include nested media; keep prefetch.
        queryset = cls._base_queryset()

        if status == Product.Status.PENDING_REVIEW:
            # The QA queue: new models, plus live models uploaded again (still on sale).
            queryset = queryset.filter(cls.awaiting_review_q())
        elif status is not None:
            queryset = queryset.filter(status=status)
        else:
            queryset = queryset.exclude(status=Product.Status.ARCHIVED)
        if kind is not None:
            if kind not in UPLOAD_KINDS:
                raise ProductError("Kind must be 'free' or 'paid'.", field="kind")
            free = Exists(
                ProductFile.objects.filter(
                    product_id=OuterRef("pk"),
                    is_preview=False,
                    storage_path__startswith=FREE_MODELS_PREFIX,
                )
            )
            queryset = queryset.filter(free if kind == UPLOAD_KIND_FREE else ~free)
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

    @staticmethod
    def awaiting_review_q() -> Q:
        """Products a reviewer must look at: pending review, or a live model's update."""
        return Q(status=Product.Status.PENDING_REVIEW) | Q(
            status=Product.Status.PUBLISHED, pending_update=True
        )

    @staticmethod
    def is_live_update(product: Product) -> bool:
        return product.status == Product.Status.PUBLISHED and product.pending_update

    @staticmethod
    def upload_kind(product: Product) -> str:
        """"free" when any sellable file is under free-models/, else "paid".

        Reads ``product.files.all()`` so a prefetched admin list adds no queries.
        """
        for product_file in product.files.all():
            if not product_file.is_preview and is_free_model_path(product_file.storage_path):
                return UPLOAD_KIND_FREE
        return UPLOAD_KIND_PAID

    @classmethod
    def get_public_by_slug(cls, slug: str) -> Product:
        try:
            return cls._base_queryset().get(
                slug=slug.strip(),
                status=Product.Status.PUBLISHED,
                category__is_active=True,
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
        cls._validate_currency_prices(currency, data.price, data.discount_price)
        license_type = cls._normalize_license(data.license_type)
        status = cls._normalize_status(data.status)
        sku = cls._validate_sku_unique(data.sku)
        import_batch_id = data.import_batch_id.strip()[:64]
        if status == Product.Status.PUBLISHED and import_batch_id:
            raise ProductError(
                "Imported products must be published via the approve endpoint.",
                field="status",
            )

        if status == Product.Status.PUBLISHED:
            raise ProductError('Create as draft, upload a package and preview, then publish.', field='status')
        if status == Product.Status.AWAITING_PRICE:
            raise ProductError(
                "A model waits for its price only after QA approves it.", field="status"
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
            package_formats=list(data.package_formats),
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
        return product

    @classmethod
    @transaction.atomic
    def update_product(
        cls,
        product: Product,
        data: ProductUpdateData,
        *,
        actor=None,
        price_source: str = ProductPriceChange.Source.ADMIN_EDIT,
    ) -> Product:
        """Apply an edit. A change to the price, sale price or sale end writes one
        ProductPriceChange row (``price_source``, ``actor``) in the same transaction."""
        product = Product.objects.select_for_update().get(pk=product.pk)
        price_before = PriceState.of(product)
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

        # An explicit slug is honoured even when a name is sent with it.
        if data.slug is not None:
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

        discount_ends_at = cls._resolve_discount_ends_at(
            product, data, discount_price, price_before.discount_price
        )
        if discount_ends_at != product.discount_ends_at:
            product.discount_ends_at = discount_ends_at
            update_fields.append("discount_ends_at")

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
            # Publishing goes through the review queue so the reviewer is recorded.
            # Direct edits cannot publish, whatever the product's origin.
            if new_status == Product.Status.PUBLISHED and product.status != Product.Status.PUBLISHED:
                raise ProductError(
                    "Publish through the review queue so the reviewer is recorded.",
                    field="status",
                )
            # Only a QA approval moves a paid model to Waiting for price.
            if (
                new_status == Product.Status.AWAITING_PRICE
                and product.status != Product.Status.AWAITING_PRICE
            ):
                raise ProductError(
                    "Approve the model in the QA queue to send it to Waiting for price.",
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

        if data.package_formats is not None:
            product.package_formats = list(data.package_formats)
            update_fields.append("package_formats")

        for field_name in ("has_thumbnail", "has_preview", "has_package"):
            value = getattr(data, field_name)
            if value is not None:
                setattr(product, field_name, value)
                update_fields.append(field_name)

        cls._validate_currency_prices(product.currency, product.price, product.discount_price)
        if product.status == Product.Status.PUBLISHED:
            cls._validate_publish_ready(product)
        product.save(update_fields=list(dict.fromkeys(update_fields)))
        record_price_change(product, price_before, source=price_source, actor=actor)
        updated = cls.get_by_id(product.pk)
        return updated

    @staticmethod
    def _resolve_discount_ends_at(
        product: Product,
        data: ProductUpdateData,
        discount_price: Decimal | None,
        previous_discount_price: Decimal | None,
    ) -> datetime | None:
        """The sale end after this edit. ``discount_price`` is the sale price after it.

        A new end must be time-zone aware, in the future, and needs a sale price. Removing
        the sale price removes its end. A new sale price on a product whose old end has
        passed must come with a new end (or null), so a sale never starts already ended.
        """
        if discount_price is None:
            if data.discount_ends_at is not None:
                raise ProductError(
                    "Set a sale price to give the sale an end date.",
                    field="discount_ends_at",
                )
            return None
        if data.clear_discount_ends_at:
            return None
        if data.discount_ends_at is not None:
            ends_at = data.discount_ends_at
            if timezone.is_naive(ends_at):
                raise ProductError(
                    "Give the sale end with a time zone.",
                    field="discount_ends_at",
                )
            if ends_at <= timezone.now():
                raise ProductError(
                    "The sale end must be in the future.",
                    field="discount_ends_at",
                )
            return ends_at
        current = product.discount_ends_at
        if (
            data.discount_price is not None
            and data.discount_price != previous_discount_price
            and current is not None
            and current <= timezone.now()
        ):
            raise ProductError(
                "This sale's end date has passed. Send a new discount_ends_at, "
                "or null for a sale with no end.",
                field="discount_ends_at",
            )
        return current

    @classmethod
    @transaction.atomic
    def archive_product(cls, product: Product) -> Product:
        return cls.update_product(
            product,
            ProductUpdateData(status=Product.Status.ARCHIVED),
        )

    @classmethod
    @transaction.atomic
    def restore_product(cls, product: Product) -> Product:
        product = Product.objects.select_for_update().get(pk=product.pk)
        if product.status != Product.Status.ARCHIVED:
            raise ProductError("Only archived products can be restored.", field="status")
        return cls.update_product(product, ProductUpdateData(status=Product.Status.DRAFT))

    @classmethod
    @transaction.atomic
    def delete_or_archive(cls, product: Product) -> str:
        """Move every selected model to Archived, retaining its records and files.

        The legacy bulk-delete endpoint and response shape remain compatible;
        all successful removals now return "archived", including unsold products.
        """
        from cart.models import CartItem
        from orders.models import OrderItem
        from wishlist.models import WishlistItem

        product = Product.objects.select_for_update().get(pk=product.pk)
        product_type = OrderItem.ProductType.PRODUCT
        if product.status != Product.Status.ARCHIVED:
            cls.archive_product(product)
        CartItem.objects.filter(product_type=product_type, product_id=product.pk).delete()
        WishlistItem.objects.filter(product_type=product_type, product_id=product.pk).delete()
        return "archived"

    @classmethod
    def _validate_publish_ready(
        cls,
        product: Product,
        *,
        require_sku: bool = False,
        check_price: bool = True,
    ) -> None:
        """Conservative publish gates for the QA approve path (Feature 16 Phase 8).

        Aligned with docs/batch-ingest-contract.md sellability needs: identity,
        pricing, category, web preview, and at least one paid package file.
        Manual publishing uses the same delivery checks; SKUs remain required for batch approval.

        ``check_price=False`` skips the price checks (price, currency, checkout minimum and
        the free-models price check): a paid model that passes QA still waits for its price.
        """
        errors: dict[str, list[str]] = {}

        if (require_sku or product.import_batch_id) and not product.sku:
            errors["sku"] = ["SKU is required before publish."]

        name = (product.name or "").strip()
        if len(name) < 2:
            errors["name"] = ["Name must be at least 2 characters."]

        if product.category_id is None:
            errors["category"] = ["Category is required before publish."]
        elif not Category.objects.filter(pk=product.category_id, is_active=True).exists():
            errors["category"] = ["Category not found or inactive."]

        if check_price:
            try:
                cls._validate_currency_prices(
                    product.currency, product.price, product.discount_price
                )
            except ProductError as exc:
                errors['price'] = [exc.message]

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
        elif not any(package_object_exists(row.storage_path) for row in sellable_files):
            errors["files"] = [
                "Sellable package object is missing from private storage. "
                "Upload or migrate the package before publish."
            ]
        elif (
            check_price
            and product.price
            and any(is_free_model_path(row.storage_path) for row in sellable_files)
        ):
            # Anyone can fetch a zip in the public free-models/ folder, so it cannot be sold.
            errors["price"] = ["This model's zip is in the free-models folder: publish it as free."]

        if not (product.preview_model or "").strip():
            errors["preview_model"] = ["Preview model is required before publish."]
        elif product.polygon_count and product.preview_triangle_count is None:
            errors["preview_model"] = [
                "Preview has not been measured. Upload the reduced preview again."
            ]
        else:
            reduction_error = preview_reduction_error(
                product.preview_triangle_count, product.polygon_count
            )
            if reduction_error:
                errors["preview_model"] = [reduction_error]

        if errors:
            raise ProductError(
                "Product is not ready to publish.",
                errors=errors,
            )

    @classmethod
    @transaction.atomic
    def approve_product(
        cls,
        product: Product,
        *,
        reviewer,
    ) -> Product:
        """QA approval (docs/PRICING_PIPELINE.md, "Statuses"). Clears reject_reason.

        - pending_review, free upload: published, with every publish gate. A price other
          than 0 becomes 0 and any sale is cleared (price history, source qa_approval).
        - pending_review, paid upload: awaiting_price. Every publish gate runs except the
          price checks; the price is set later on the Pricing page.
        - live update (published + ``pending_update``): stays published, the flag is
          cleared and the price is kept.

        QA never sets a paid model's price.
        """
        product = Product.objects.select_for_update().get(pk=product.pk)
        live_update = cls.is_live_update(product)
        if product.status != Product.Status.PENDING_REVIEW and not live_update:
            raise ProductError(
                f"Cannot approve product with status '{product.status}'.",
                field="status",
            )

        before = PriceState.of(product)
        price_fields: list[str] = []
        if live_update:
            new_status = Product.Status.PUBLISHED
            cls._validate_publish_ready(product, require_sku=True)
        elif cls.upload_kind(product) == UPLOAD_KIND_FREE:
            new_status = Product.Status.PUBLISHED
            # A free model is a free download: price 0 and no sale.
            if (
                product.price != 0
                or product.discount_price is not None
                or product.discount_ends_at is not None
            ):
                product.price = Decimal("0.00")
                product.discount_price = None
                product.discount_ends_at = None
                price_fields = ["price", "discount_price", "discount_ends_at"]
            cls._validate_status_transition(product.status, new_status)
            cls._validate_publish_ready(product, require_sku=True)
        else:
            new_status = Product.Status.AWAITING_PRICE
            cls._validate_status_transition(product.status, new_status)
            cls._validate_publish_ready(product, require_sku=True, check_price=False)

        product.status = new_status
        product.pending_update = False
        product.reviewed_at = timezone.now()
        product.reviewed_by = reviewer
        # Clear prior rejection text on approve; qa_notes retained for audit.
        product.reject_reason = ""
        product.save(
            update_fields=[
                "status",
                "pending_update",
                "reviewed_at",
                "reviewed_by",
                "reject_reason",
                *price_fields,
                "updated_at",
            ]
        )
        record_price_change(
            product,
            before,
            source=ProductPriceChange.Source.QA_APPROVAL,
            actor=reviewer,
        )
        approved = cls.get_by_id(product.pk)
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
        """pending_review or awaiting_price → rejected. Stores reject_reason + review metadata.

        Rejecting a live model's update takes the model off sale too (published → rejected):
        its new files are already what the store serves, and they cannot be rolled back.
        Buyers keep their downloads (downloads follow the paid order, not the status).
        """
        live_update = cls.is_live_update(product)
        if (
            product.status not in (Product.Status.PENDING_REVIEW, Product.Status.AWAITING_PRICE)
            and not live_update
        ):
            raise ProductError(
                f"Cannot reject product with status '{product.status}'.",
                field="status",
            )
        normalized_reason = reason.strip()
        if not normalized_reason:
            raise ProductError("Reject reason is required.", field="reason")

        # A live update leaves published directly, which ordinary edits may not do.
        if not live_update:
            cls._validate_status_transition(product.status, Product.Status.REJECTED)

        product.status = Product.Status.REJECTED
        product.pending_update = False
        product.reject_reason = normalized_reason
        product.reviewed_at = timezone.now()
        product.reviewed_by = reviewer
        update_fields = [
            "status",
            "pending_update",
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
        return requeued

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
            # A sale must save the buyer money (docs/PRICING_PIPELINE.md).
            if discount_price >= price:
                raise ProductError(
                    "The sale price must be lower than the normal price.",
                    field="discount_price",
                )

    @staticmethod
    def _normalize_currency(currency: str) -> str:
        try:
            return normalize_currency(currency)
        except ValueError as exc:
            raise ProductError(str(exc), field='currency') from exc

    @staticmethod
    def _validate_currency_prices(currency, price, discount):
        try:
            validate_catalog_prices(currency, price, discount)
        except ValueError as exc:
            raise ProductError(str(exc), field='price') from exc

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
                # QA approval of a paid model only (never a direct edit).
                Product.Status.AWAITING_PRICE,
                Product.Status.REJECTED,
                Product.Status.ARCHIVED,
            },
            Product.Status.AWAITING_PRICE: {
                # The Pricing page publish only (Part 2), never a direct edit.
                Product.Status.PUBLISHED,
                Product.Status.REJECTED,
                # The uploader sends the model again: back to QA.
                Product.Status.PENDING_REVIEW,
                Product.Status.DRAFT,
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
                # The uploader sends an archived model again: back to QA.
                Product.Status.PENDING_REVIEW,
            },
        }
        next_statuses = allowed.get(current, set())
        if new_status not in next_statuses:
            raise ProductError(
                f"Cannot change status from '{current}' to '{new_status}'.",
                field="status",
            )
