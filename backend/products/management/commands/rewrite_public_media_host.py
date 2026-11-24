"""Move saved public-bucket addresses from the old address to R2_PUBLIC_BASE_URL.

The database stores full addresses (``https://<public base>/models/...?v=<hash>``) for images,
previews, 360 frames and avatars. When the public bucket gets a new address, the saved ones keep
the old address until this command rewrites them. Only the start of the address changes: the
object key and the ``?v=`` tag stay as they are. Running it twice changes nothing the second time.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone


@dataclass(frozen=True)
class AddressField:
    model: str  # "app_label.ModelName"
    field: str
    is_list: bool = False  # a JSON list of addresses (360 frames)


# Every field that can hold a public-bucket address.
ADDRESS_FIELDS: tuple[AddressField, ...] = (
    AddressField("products.Product", "thumbnail"),
    AddressField("products.Product", "preview_model"),
    AddressField("products.Product", "preview_video"),
    AddressField("products.Product", "spin_images", is_list=True),
    AddressField("products.ProductImage", "image_url"),
    AddressField("products.ProductFile", "storage_path"),
    AddressField("plugins.Plugin", "thumbnail"),
    AddressField("plugins.PluginImage", "image_url"),
    AddressField("plugins.PluginFile", "storage_path"),
    AddressField("plugins.PluginCategory", "image"),
    AddressField("categories.Category", "image"),
    AddressField("accounts.User", "avatar"),
)


def _base(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def rewrite_address(value: str, old_base: str, new_base: str) -> str:
    """``value`` with ``old_base`` swapped for ``new_base``; anything else is returned as is."""
    if isinstance(value, str) and value.startswith(f"{old_base}/"):
        return new_base + value[len(old_base) :]
    return value


def _rewrite_value(value, spec: AddressField, old_base: str, new_base: str):
    if spec.is_list:
        if not isinstance(value, list):
            return value
        return [rewrite_address(item, old_base, new_base) for item in value]
    return rewrite_address(value, old_base, new_base)


def rewrite_public_media_host(
    old_base: str, new_base: str, *, execute: bool
) -> dict[str, int]:
    """Rewrite every saved address on ``old_base``. Returns rows changed (or to change) per
    field, as ``"Model.field": count``."""
    counts: dict[str, int] = {}
    now = timezone.now()
    for spec in ADDRESS_FIELDS:
        model = apps.get_model(spec.model)
        has_updated_at = any(field.name == "updated_at" for field in model._meta.fields)
        queryset = model.objects.all() if spec.is_list else model.objects.filter(
            **{f"{spec.field}__startswith": f"{old_base}/"}
        )
        changed = 0
        for pk, value in queryset.values_list("pk", spec.field).iterator():
            new_value = _rewrite_value(value, spec, old_base, new_base)
            if new_value == value:
                continue
            changed += 1
            if execute:
                updates = {spec.field: new_value}
                if has_updated_at:
                    updates["updated_at"] = now
                # update() writes only this field: no save() side effects for a host change.
                with transaction.atomic():
                    model.objects.filter(pk=pk).update(**updates)
        counts[f"{model.__name__}.{spec.field}"] = changed
    return counts


class Command(BaseCommand):
    help = (
        "Rewrite saved public-bucket addresses from R2_PUBLIC_BASE_URL_PREVIOUS to "
        "R2_PUBLIC_BASE_URL. Shows counts only by default; pass --execute to change them."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Change the saved addresses (without it, only count them).",
        )

    def handle(self, *args, **options) -> None:
        old_base = _base(getattr(settings, "R2_PUBLIC_BASE_URL_PREVIOUS", ""))
        new_base = _base(getattr(settings, "R2_PUBLIC_BASE_URL", ""))
        if not old_base or not new_base:
            raise CommandError(
                "Set R2_PUBLIC_BASE_URL (the new address) and R2_PUBLIC_BASE_URL_PREVIOUS "
                "(the old one) first."
            )
        if old_base == new_base:
            raise CommandError("R2_PUBLIC_BASE_URL_PREVIOUS is the same as R2_PUBLIC_BASE_URL.")
        for base in (old_base, new_base):
            if not base.startswith("https://"):
                raise CommandError(f"{base} must start with https://")

        execute = options["execute"]
        counts = rewrite_public_media_host(old_base, new_base, execute=execute)
        total = sum(counts.values())

        self.stdout.write(f"From: {old_base}")
        self.stdout.write(f"To:   {new_base}")
        for name, count in counts.items():
            self.stdout.write(f"  {name}: {count}")
        if execute:
            self.stdout.write(self.style.SUCCESS(f"Changed {total} saved address row(s)."))
        elif total:
            self.stdout.write(
                f"{total} row(s) would change. Run again with --execute to change them."
            )
        else:
            self.stdout.write(self.style.SUCCESS("Nothing left on the old address."))
