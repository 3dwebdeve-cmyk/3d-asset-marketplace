"""Remove the Model ID Tool's "Folders in model folder: ..." list from product descriptions."""

from django.core.management.base import BaseCommand
from django.db import transaction

from products.catalog_import import strip_folder_listing
from products.models import Product


class Command(BaseCommand):
    help = (
        "Find products whose description or short description ends with the pipeline's "
        "'Folders in model folder: ...' list and remove that list. Dry run by default; "
        "pass --apply to save. Live products change on the site within a few minutes."
    )

    def add_arguments(self, parser) -> None:
        mode = parser.add_mutually_exclusive_group()
        mode.add_argument(
            "--dry-run",
            action="store_true",
            help="Only print what would change (the default).",
        )
        mode.add_argument(
            "--apply",
            action="store_true",
            help="Save the cleaned descriptions.",
        )

    def handle(self, *args, **options) -> None:
        apply = options["apply"]
        changed = 0

        candidates = Product.objects.filter(description__icontains="folders in model folder") | (
            Product.objects.filter(short_description__icontains="folders in model folder")
        )
        for product in candidates.order_by("sku", "slug"):
            description = strip_folder_listing(product.description)
            short_description = strip_folder_listing(product.short_description)[:500]
            fields = [
                name
                for name, new in (("description", description), ("short_description", short_description))
                if new != (getattr(product, name) or "").strip()
            ]
            if not fields:
                continue
            changed += 1
            label = product.sku or product.slug
            self.stdout.write(f"{'cleaned' if apply else 'would clean'} {label} ({product.status}): {', '.join(fields)}")
            self.stdout.write(f"    description now ends: ...{description[-80:]!r}")
            if apply:
                with transaction.atomic():
                    product.description = description
                    product.short_description = short_description
                    product.save(update_fields=[*fields, "updated_at"])

        verb = "Cleaned" if apply else "Would clean"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {changed} product(s)."
                + ("" if apply or not changed else " Run again with --apply to save.")
            )
        )
