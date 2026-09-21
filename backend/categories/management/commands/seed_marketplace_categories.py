"""Idempotently seed the marketplace product category catalog."""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from categories.models import Category

# Display names for the public catalog (flat list, no parents).
MARKETPLACE_CATEGORIES: tuple[str, ...] = (
    "Furniture",
    "Products",
    "Toys",
    "Electronics",
    "Food & Drink",
    "Character",
    "Industrial",
    "Household",
    "Plants / Vegetation",
    "Lights",
    "3d Printing",
    "Assets / Props",
    "LifeStyle / Visualisation",
    "Cloth Items",
    "Interactive / WebAr",
    "Architectural 3D Models",
    "Interior 3D Models",
)


class Command(BaseCommand):
    help = (
        "Idempotently create/update marketplace product categories by stable slug. "
        "Safe to re-run; does not delete existing categories."
    )

    def handle(self, *args, **options) -> None:
        created = 0
        updated = 0
        unchanged = 0

        with transaction.atomic():
            for name in MARKETPLACE_CATEGORIES:
                slug = slugify(name.strip()) or "category"
                category, was_created = Category.objects.get_or_create(
                    slug=slug,
                    defaults={
                        "name": name,
                        "is_active": True,
                        "parent": None,
                    },
                )
                if was_created:
                    created += 1
                    self.stdout.write(self.style.SUCCESS(f"Created {name} ({slug})"))
                    continue

                changed_fields: list[str] = []
                if category.name != name:
                    category.name = name
                    changed_fields.append("name")
                if not category.is_active:
                    category.is_active = True
                    changed_fields.append("is_active")
                if changed_fields:
                    category.save(update_fields=[*changed_fields, "updated_at"])
                    updated += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"Updated {slug}: {', '.join(changed_fields)}"
                        )
                    )
                else:
                    unchanged += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. created={created} updated={updated} unchanged={unchanged}"
            )
        )
