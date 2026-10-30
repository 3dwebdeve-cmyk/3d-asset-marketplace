"""Delete the preview and WebP copies older catalog imports left in the public bucket."""

from django.core.management.base import BaseCommand

from config.media import media_relative_path
from config.storages import get_public_storage
from products.catalog_import import is_import_copy_key
from products.models import Product, ProductFile, ProductImage


class Command(BaseCommand):
    help = (
        "List models/<sku>/*-<12 hex>.webp and models/<sku>/preview-<32 hex>.glb in the "
        "public bucket that no product, gallery image or product file points at. "
        "Dry run by default; pass --delete to remove them. Re-import the models first, "
        "so the products point at the uploader's original files."
    )

    def add_arguments(self, parser) -> None:
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument(
            "--dry-run",
            action="store_true",
            help="Only print what would be deleted (the default).",
        )
        mode.add_argument(
            "--delete",
            action="store_true",
            help="Delete the unreferenced copies.",
        )

    def handle(self, *args, **options) -> None:
        delete = options["delete"]
        storage = get_public_storage()
        referenced = _referenced_keys()

        copies = [key for key in _walk(storage, "models") if is_import_copy_key(key)]
        orphans = [key for key in copies if key not in referenced]
        kept = len(copies) - len(orphans)

        for key in orphans:
            if delete:
                storage.delete(key)
                self.stdout.write(f"deleted {key}")
            else:
                self.stdout.write(f"would delete {key}")

        verb = "Deleted" if delete else "Would delete"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {len(orphans)} copies; kept {kept} still in use."
                + ("" if delete else " Run again with --delete to remove them.")
            )
        )


def _referenced_keys() -> set[str]:
    urls = [
        *Product.objects.values_list("thumbnail", flat=True),
        *Product.objects.values_list("preview_model", flat=True),
        *ProductImage.objects.values_list("image_url", flat=True),
        *ProductFile.objects.values_list("storage_path", flat=True),
    ]
    return {key for key in (media_relative_path(url or "") for url in urls) if key}


def _walk(storage, prefix: str):
    """Every object key under ``prefix`` (works for R2 and local media storage)."""
    try:
        directories, files = storage.listdir(prefix)
    except FileNotFoundError:
        return
    for name in files:
        yield f"{prefix}/{name}"
    for name in directories:
        yield from _walk(storage, f"{prefix}/{name}")
