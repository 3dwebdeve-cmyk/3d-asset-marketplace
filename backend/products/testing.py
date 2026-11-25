"""Test fixtures shared by product tests (not imported by application code)."""

from __future__ import annotations

import json
import struct
from decimal import Decimal
from io import BytesIO
from pathlib import PurePosixPath

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image


def make_glb_bytes(triangles: int = 0) -> bytes:
    """Minimal valid GLB whose single mesh draws ``triangles`` triangles."""
    document: dict = {"asset": {"version": "2.0"}}
    if triangles:
        document["accessors"] = [{"count": triangles * 3, "componentType": 5125, "type": "SCALAR"}]
        document["meshes"] = [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 0}]}]
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    return struct.pack("<4sIIII", b"glTF", 2, 20 + len(payload), len(payload), 0x4E4F534A) + payload


_IMAGE_FORMATS = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}


def make_image_bytes(extension: str) -> bytes:
    """A tiny valid image in the format the extension names."""
    output = BytesIO()
    Image.new("RGB", (8, 8), color=(120, 90, 60)).save(output, format=_IMAGE_FORMATS[extension])
    return output.getvalue()


def put_pipeline_images(items: list[dict]) -> None:
    """Upload each item's thumbnail, gallery images and 360° frames, as the pipeline does.

    The import reads them from storage before it creates the product.
    """
    for item in items:
        media = item.get("media") or {}
        image_keys = [
            media.get("thumbnail_key"),
            *(media.get("gallery_keys") or []),
            *(media.get("spin_keys") or []),
        ]
        for image_key in (str(k or "") for k in image_keys):
            extension = "." + image_key.rsplit(".", 1)[-1].lower() if "." in image_key else ""
            if (
                image_key.startswith(("models/", "free-models/", "360/"))
                and ".." not in image_key
                and extension in _IMAGE_FORMATS
                and not default_storage.exists(image_key)
            ):
                default_storage.save(image_key, ContentFile(make_image_bytes(extension)))


def put_pipeline_uploads(items: list[dict], *, triangles: int = 100) -> None:
    """Upload each item's preview, thumbnail and gallery images, as the batch pipeline does."""
    for item in items:
        key = str((item.get("media") or {}).get("preview_key") or "")
        name = PurePosixPath(key).name.lower()
        # preview-<hex>.glb is a copy older imports made, never a pipeline upload.
        if (
            name.endswith(".glb")
            and not name.startswith("preview-")
            and ".." not in key
            and not default_storage.exists(key)
        ):
            default_storage.save(key, ContentFile(make_glb_bytes(triangles)))
    put_pipeline_images(items)


def moved_media(media: dict, old: str, new: str) -> dict:
    """``media`` with ``old`` replaced by ``new`` once in every text, package entries and
    lists included (for example models/ to free-models/, or one Model ID to another)."""

    def moved(value):
        if isinstance(value, str):
            return value.replace(old, new, 1)
        if isinstance(value, list):
            return [moved(entry) for entry in value]
        if isinstance(value, dict):
            return {key: moved(entry) for key, entry in value.items()}
        return value

    return moved(media)


def package_media(prefix: str, sku: str, kinds: tuple[str, ...] = ("whole",)) -> dict:
    """The import's ``media.package_key`` and ``media.packages`` for these package kinds, named
    as the Model ID Tool names its zips (``<prefix><sku>_<kind>.zip``); the first is the main zip."""
    packages = [
        {
            "kind": kind,
            "key": f"{prefix}{sku}_{kind}.zip",
            "file_name": f"{sku}_{kind}.zip",
            "file_format": "zip",
            "file_size": 1048576,
        }
        for kind in kinds
    ]
    return {"package_key": packages[0]["key"], "packages": packages}


def price_packages(product, price: str, **sale) -> None:
    """Give every package of ``product`` this price (and sale fields), as the Pricing page
    saves them, then update the product's summary price."""
    from products.packages import sync_summary_price

    product.files.filter(is_preview=False).exclude(package_kind="").update(
        price=Decimal(price), **sale
    )
    sync_summary_price(product)


# The one package kind tests buy and price. Whole File is never sold on its own (All variations
# sells it), so no test fixture, cart line or order line may name a kind by hand: use this.
SOLD_PACKAGE_KIND = "glb_only"
# The kind of the one zip of a single-zip model, sold as its only package. Only a single-zip
# model may sell it: use this constant, never a hand-written "whole".
SINGLE_ZIP_KIND = "whole"


def sell_package(product, kind: str = SOLD_PACKAGE_KIND, price=None, **sale):
    """Give ``product`` a priced package of this kind (the product's own price and sale by
    default), as a model is sold after the Pricing page. Returns the package row."""
    from products.models import ProductFile

    package, _ = ProductFile.objects.update_or_create(
        product=product,
        package_kind=kind,
        defaults={
            "file_name": f"{product.slug}_{kind}.zip",
            "file_format": "zip",
            "file_size": 1024,
            "storage_path": f"products/files/{product.slug}_{kind}.zip",
            "is_preview": False,
            "price": Decimal(str(price)) if price is not None else product.price,
            "discount_price": sale.get(
                "discount_price", product.discount_price if price is None else None
            ),
            "discount_ends_at": sale.get(
                "discount_ends_at", product.discount_ends_at if price is None else None
            ),
        },
    )
    return package


def put_pipeline_packages(items: list[dict]) -> None:
    """Upload each item's package zips, as the batch pipeline does before an import."""
    for item in items:
        for package in (item.get("media") or {}).get("packages") or ():
            key = str(package.get("key") or "")
            if key.lower().endswith(".zip") and ".." not in key and not default_storage.exists(key):
                default_storage.save(key, ContentFile(b"PK\x05\x06" + b"\x00" * 18))


def put_pipeline_objects(items: list[dict], *, triangles: int = 100) -> None:
    """Upload every object the pipeline puts on R2 before calling the import."""
    put_pipeline_uploads(items, triangles=triangles)
    put_pipeline_packages(items)
