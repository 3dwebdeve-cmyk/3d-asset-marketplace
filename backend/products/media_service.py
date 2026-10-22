"""Product images and files: upload, replace and delete, and the public preview rule."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction

from products.errors import ProductError
from products.models import Product, ProductFile, ProductImage
from products.storage import ProductMediaStorageService
from products.upload_rules import (
    validate_product_file_upload,
    validate_product_image_upload,
)

# A public preview may draw at most this share of the model's polygon count, so the
# file anyone can fetch from the product page is a reduced model, not the product.
PREVIEW_MAX_POLYGON_SHARE = 0.5


def preview_reduction_error(triangles: int | None, polygon_count: int | None) -> str | None:
    """Why a preview is too detailed to be public, or None. Unknown counts pass."""
    if not triangles or not polygon_count:
        return None
    limit = int(polygon_count * PREVIEW_MAX_POLYGON_SHARE)
    if triangles <= limit:
        return None
    return (
        f"Preview has {triangles} triangles; the limit is {limit} "
        f"(half of the model's {polygon_count} polygons). Upload a reduced preview."
    )


class ProductMediaService:
    """Inherited by ProductService, so callers use ProductService.add_image() and so on."""

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
            reduction_error = preview_reduction_error(
                validated.triangle_count, product.polygon_count
            )
            if reduction_error:
                raise ProductError(reduction_error, field="file")
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
            product.preview_triangle_count = validated.triangle_count
            product.save(update_fields=["preview_model", "preview_triangle_count", "updated_at"])

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
            # The replacement was not measured when stored; the approve gate cannot check it.
            product.preview_triangle_count = None
            product.save(update_fields=["preview_model", "preview_triangle_count", "updated_at"])
