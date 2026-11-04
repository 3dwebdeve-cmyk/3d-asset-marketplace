"""Phase I3 — batch intake Excel / fixture smoke (no secrets printed).

Validates frozen column headers in ``docs/fixtures/batch-ingest/``, dry-runs
the Feature 16 ready-to-import gate via ``CatalogImportService``, and optionally
applies happy-path import → QA approve.
"""

from __future__ import annotations

import csv
import json
import os
import re
import struct
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any
from zipfile import ZipFile

from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image

from config.storages import get_private_storage, get_public_storage

from accounts.models import User
from categories.models import Category
from products.catalog_import import CatalogImportService
from products.models import Product, ProductFile
from products.services import ProductError, ProductService

# Locked headers — keep in sync with docs/batch-ingest-contract.md §A / §B.
REPORT_COLUMNS: tuple[str, ...] = (
    "Model_ID",
    "Model Name",
    "Category",
    "Subcategory",
    "Polycount",
    "Original Folder Name",
    "Folder Match Status",
    "FBX Export",
    "OBJ Export",
    "glTF Export",
    "GLB Export",
    "MAX Export",
    "FBX Size (MB)",
    "OBJ Size (MB)",
    "glTF Size (MB)",
    "GLB Size (MB)",
    "MAX Size (MB)",
    "GLB Checksum (SHA256)",
    "Texture Count",
    "Textures Folder Path",
    "Output Folder Path",
    "R2 Key Prefix",
    "QA Status",
    "QA Notes",
    "Batch Timestamp",
)

INTAKE_COLUMNS: tuple[str, ...] = (
    "Model_ID",
    "Price",
    "Currency",
    "Discount Price",
    "Short Description",
    "Description",
    "Thumbnail Path",
    "Gallery Image Paths",
    "License Type",
    "Tags",
    "Rigged",
    "Animated",
    "PBR Ready",
    "Game Ready",
    "Software Used",
)

_SCENARIOS: tuple[str, ...] = ("happy", "mismatch", "gate-failures")

_EXPECTED_GATE: dict[str, str | None] = {
    "MDL-000142": None,
    "MDL-000199": "folder_mismatch",
    "MDL-000201": "exports_incomplete",
    "MDL-000202": "invalid_price",
    "MDL-000203": "missing_thumbnail",
}

_BOOL_TRUE = frozenset({"TRUE", "1", "YES", "Y"})
_EXPORT_KEYS = ("fbx", "obj", "gltf", "glb", "max")
_EXPORT_COL = {
    "fbx": "FBX Export",
    "obj": "OBJ Export",
    "gltf": "glTF Export",
    "glb": "GLB Export",
    "max": "MAX Export",
}
_SIZE_COL = {
    "fbx": "FBX Size (MB)",
    "obj": "OBJ Size (MB)",
    "gltf": "glTF Size (MB)",
    "glb": "GLB Size (MB)",
    "max": "MAX Size (MB)",
}


@dataclass(frozen=True)
class BatchIngestSmokeCheck:
    name: str
    ok: bool
    detail: str
    blocking: bool = True


@dataclass(frozen=True)
class BatchIngestSmokeResult:
    checks: tuple[BatchIngestSmokeCheck, ...]
    applied: bool = False
    published_sku: str = ""
    warnings: tuple[str, ...] = field(default_factory=tuple)

    @property
    def blocking_failures(self) -> tuple[BatchIngestSmokeCheck, ...]:
        return tuple(c for c in self.checks if c.blocking and not c.ok)

    @property
    def all_ok(self) -> bool:
        return not self.blocking_failures


class BatchIngestSmokeError(Exception):
    """Operator-facing smoke failure (no secrets in message)."""


def fixtures_root() -> Path:
    """Fixture folder: ``BATCH_INGEST_FIXTURES_DIR`` or the repo's ``docs/fixtures/batch-ingest``.

    The backend Docker image does not contain ``docs/``, so containers must mount the
    fixtures and point ``BATCH_INGEST_FIXTURES_DIR`` at them.
    """
    override = os.environ.get("BATCH_INGEST_FIXTURES_DIR", "").strip()
    if override:
        return Path(override).resolve()
    return Path(settings.BASE_DIR).resolve().parent / "docs" / "fixtures" / "batch-ingest"


def _read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise BatchIngestSmokeError(f"CSV has no header row: {path.name}")
        headers = [h.strip() for h in reader.fieldnames]
        rows = [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in reader]
    return headers, rows


def _headers_match(actual: list[str], expected: tuple[str, ...]) -> tuple[bool, str]:
    if actual == list(expected):
        return True, f"{len(expected)} columns match contract"
    missing = [c for c in expected if c not in actual]
    extra = [c for c in actual if c not in expected]
    parts: list[str] = []
    if missing:
        parts.append(f"missing={missing}")
    if extra:
        parts.append(f"extra={extra}")
    if not missing and not extra and actual != list(expected):
        parts.append("column order differs from contract")
    return False, "; ".join(parts) or "header mismatch"


def _folder_files_by_model(tree_path: Path) -> dict[str, set[str]]:
    """Parse folder-tree.txt into Model_ID → relative filenames present."""
    text = tree_path.read_text(encoding="utf-8")
    by_model: dict[str, set[str]] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        model_match = re.search(r"(MDL-[A-Z0-9_-]+)", line, re.IGNORECASE)
        if model_match and ("/" in line or "\\" in line) and "├" not in line and "└" not in line:
            current = model_match.group(1).upper()
            by_model.setdefault(current, set())
            continue
        if current is None:
            continue
        # Tree leaves look like "├── thumbnail.jpg" or "│   └── albedo.jpg"
        name = re.sub(r"^[│├└─\s]+", "", line).strip().rstrip("/")
        if name and not name.endswith(":"):
            by_model.setdefault(current, set()).add(name.lower())
    return by_model


def _parse_bool(raw: str) -> bool:
    return raw.strip().upper() in _BOOL_TRUE


def _split_paths(raw: str) -> list[str]:
    if not raw.strip():
        return []
    parts = re.split(r"[|;]", raw)
    return [p.strip().replace("\\", "/") for p in parts if p.strip()]


def _resolve_thumbnail_key(
    *,
    sku: str,
    intake_thumb: str,
    disk_files: set[str],
) -> str:
    if intake_thumb:
        rel = intake_thumb.replace("\\", "/").lstrip("/")
        return f"models/{sku}/{rel}"
    if "thumbnail.jpg" in disk_files:
        return f"models/{sku}/thumbnail.jpg"
    return ""


def _resolve_gallery_keys(*, sku: str, intake_gallery: str) -> list[str]:
    keys: list[str] = []
    for rel in _split_paths(intake_gallery):
        keys.append(f"models/{sku}/{rel.lstrip('/')}")
    return keys


def _row_to_import_item(
    report: dict[str, str],
    intake: dict[str, str] | None,
    disk_files: set[str],
) -> dict[str, Any]:
    sku = (report.get("Model_ID") or "").strip().upper()
    intake = intake or {}
    exports: dict[str, Any] = {}
    for key in _EXPORT_KEYS:
        exports[key] = report.get(_EXPORT_COL[key], "")
        size_raw = report.get(_SIZE_COL[key], "")
        if size_raw != "":
            exports[f"{key}_size"] = size_raw

    thumb_key = _resolve_thumbnail_key(
        sku=sku,
        intake_thumb=intake.get("Thumbnail Path", ""),
        disk_files=disk_files,
    )
    gallery_keys = _resolve_gallery_keys(
        sku=sku,
        intake_gallery=intake.get("Gallery Image Paths", ""),
    )
    has_package = "package.zip" in disk_files
    media: dict[str, Any] = {
        "thumbnail_key": thumb_key,
        "preview_key": f"models/{sku}/preview.glb" if "preview.glb" in disk_files else "",
        "package_key": f"models/{sku}/package.zip" if has_package else "",
        "package_file_name": "package.zip",
        "package_file_format": "zip",
        "package_file_size": 1048576 if has_package else 0,
        "gallery_keys": gallery_keys,
    }

    price_raw = intake.get("Price", "")
    price: str | None = price_raw if price_raw != "" else None
    discount_raw = intake.get("Discount Price", "")
    discount: str | None = discount_raw if discount_raw != "" else None

    poly_raw = report.get("Polycount", "")
    polygon_count: int | None
    try:
        polygon_count = int(poly_raw) if poly_raw else None
    except ValueError:
        polygon_count = None

    return {
        "model_id": sku,
        "name": report.get("Model Name", ""),
        "category": report.get("Category", ""),
        "subcategory": report.get("Subcategory", ""),
        "price": price,
        "currency": intake.get("Currency", "") or "USD",
        "discount_price": discount,
        "short_description": intake.get("Short Description", ""),
        "description": intake.get("Description", ""),
        "license_type": intake.get("License Type", "") or "standard",
        "rigged": _parse_bool(intake.get("Rigged", "")),
        "animated": _parse_bool(intake.get("Animated", "")),
        "pbr_ready": _parse_bool(intake.get("PBR Ready", "")),
        "game_ready": _parse_bool(intake.get("Game Ready", "")),
        "software_used": intake.get("Software Used", ""),
        "polygon_count": polygon_count,
        "glb_checksum": report.get("GLB Checksum (SHA256)", ""),
        "qa_status": report.get("QA Status", ""),
        "folder_match_status": report.get("Folder Match Status", ""),
        "r2_key_prefix": report.get("R2 Key Prefix", ""),
        "exports": exports,
        "media": media,
    }


def load_scenario_items(scenario: str) -> list[dict[str, Any]]:
    root = fixtures_root() / scenario
    report_path = root / "batch-output-report.csv"
    intake_path = root / "phase1-intake.csv"
    tree_path = root / "folder-tree.txt"
    if not report_path.is_file() or not intake_path.is_file() or not tree_path.is_file():
        raise BatchIngestSmokeError(f"Incomplete fixture set under {scenario}/")

    _, report_rows = _read_csv(report_path)
    _, intake_rows = _read_csv(intake_path)
    intake_by_id = {
        (row.get("Model_ID") or "").strip().upper(): row for row in intake_rows
    }
    disk_by_model = _folder_files_by_model(tree_path)

    items: list[dict[str, Any]] = []
    for report in report_rows:
        sku = (report.get("Model_ID") or "").strip().upper()
        items.append(
            _row_to_import_item(
                report,
                intake_by_id.get(sku),
                disk_by_model.get(sku, set()),
            )
        )
    return items


def _check_fixture_headers() -> list[BatchIngestSmokeCheck]:
    checks: list[BatchIngestSmokeCheck] = []
    root = fixtures_root()
    if not root.is_dir():
        return [
            BatchIngestSmokeCheck(
                name="fixtures_present",
                ok=False,
                detail=f"Missing fixtures root: {root}",
            )
        ]
    checks.append(
        BatchIngestSmokeCheck(
            name="fixtures_present",
            ok=True,
            detail=str(root),
        )
    )
    for scenario in _SCENARIOS:
        report_headers, _ = _read_csv(root / scenario / "batch-output-report.csv")
        intake_headers, _ = _read_csv(root / scenario / "phase1-intake.csv")
        ok_r, detail_r = _headers_match(report_headers, REPORT_COLUMNS)
        ok_i, detail_i = _headers_match(intake_headers, INTAKE_COLUMNS)
        checks.append(
            BatchIngestSmokeCheck(
                name=f"headers_report_{scenario}",
                ok=ok_r,
                detail=detail_r,
            )
        )
        checks.append(
            BatchIngestSmokeCheck(
                name=f"headers_intake_{scenario}",
                ok=ok_i,
                detail=detail_i,
            )
        )
    return checks


def _check_gate_dry_run() -> list[BatchIngestSmokeCheck]:
    checks: list[BatchIngestSmokeCheck] = []
    observed: dict[str, str | None] = {}
    for scenario in _SCENARIOS:
        for item in load_scenario_items(scenario):
            sku = str(item["model_id"])
            reason = CatalogImportService._gate_item(item)
            observed[sku] = reason

    for sku, expected in _EXPECTED_GATE.items():
        actual = observed.get(sku, "__missing__")
        if actual == "__missing__":
            checks.append(
                BatchIngestSmokeCheck(
                    name=f"gate_{sku}",
                    ok=False,
                    detail="Model_ID not found in fixtures",
                )
            )
            continue
        ok = actual == expected
        if expected is None:
            detail = "pass (ready to import)" if ok else f"expected pass, got {actual}"
        else:
            detail = (
                f"skipped:{actual}" if ok else f"expected {expected}, got {actual}"
            )
        checks.append(
            BatchIngestSmokeCheck(
                name=f"gate_{sku}",
                ok=ok,
                detail=detail,
            )
        )
    return checks


def _ensure_furniture_category() -> Category:
    parent, _ = Category.objects.get_or_create(
        slug="furniture",
        defaults={"name": "Furniture", "is_active": True},
    )
    if parent.name != "Furniture" or not parent.is_active:
        parent.name = "Furniture"
        parent.is_active = True
        parent.save(update_fields=["name", "is_active", "updated_at"])
    child, _ = Category.objects.get_or_create(
        slug="chairs",
        defaults={"name": "Chairs", "parent": parent, "is_active": True},
    )
    if child.parent_id != parent.pk or child.name != "Chairs" or not child.is_active:
        child.parent = parent
        child.name = "Chairs"
        child.is_active = True
        child.save(update_fields=["parent", "name", "is_active", "updated_at"])
    return child


def _write_package_bytes(storage_path: str) -> None:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("model.glb", b"glTF-binary-batch-ingest-smoke")
    # Packages are private objects. Never delete or overwrite an existing one: on a
    # shared environment that key could hold a real package for this SKU.
    storage = get_private_storage()
    if storage.exists(storage_path):
        return
    storage.save(storage_path, ContentFile(buffer.getvalue()))


def _write_preview_bytes(storage_path: str) -> None:
    """Stand-in for the pipeline's preview upload; the import checks it in place."""
    document = json.dumps({"asset": {"version": "2.0"}}).encode()
    document += b" " * (-len(document) % 4)
    glb = struct.pack("<4sIIII", b"glTF", 2, 20 + len(document), len(document), 0x4E4F534A)
    storage = get_public_storage()
    if storage.exists(storage_path):
        return
    storage.save(storage_path, ContentFile(glb + document))


_IMAGE_FORMATS = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}


def _write_image_bytes(storage_path: str) -> None:
    """Stand-in for the pipeline's thumbnail/gallery upload; the import checks it in place."""
    image_format = _IMAGE_FORMATS.get(Path(storage_path).suffix.lower())
    storage = get_public_storage()
    if image_format is None or storage.exists(storage_path):
        return
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color=(120, 90, 60)).save(buffer, format=image_format)
    storage.save(storage_path, ContentFile(buffer.getvalue()))


def _pick_reviewer() -> User:
    admin = (
        User.objects.filter(role__role_name="Administrator", is_active=True)
        .order_by("created_at")
        .first()
    )
    if admin is None:
        raise BatchIngestSmokeError(
            "No active Administrator — run ensure_administrator before --apply."
        )
    return admin


def _apply_happy_path() -> tuple[str, list[str]]:
    """Import happy fixture → approve. Returns (sku, warnings)."""
    warnings: list[str] = []
    _ensure_furniture_category()
    reviewer = _pick_reviewer()
    items = load_scenario_items("happy")
    if not items:
        raise BatchIngestSmokeError("Happy fixture produced zero rows.")
    for item in items:
        preview_key = str(item["media"].get("preview_key") or "")
        if preview_key:
            _write_preview_bytes(preview_key)
        for image_key in (item["media"].get("thumbnail_key"), *item["media"].get("gallery_keys", [])):
            if image_key:
                _write_image_bytes(str(image_key))
        # The import skips a row whose package is not in private storage yet.
        package_key = str(item["media"].get("package_key") or "")
        if package_key:
            _write_package_bytes(package_key)

    batch = CatalogImportService.import_batch(
        import_batch_id="i3-batch-ingest-smoke",
        import_source="catalog-bridge",
        items=items,
        actor_id=str(reviewer.pk),
    )
    sku = str(items[0]["model_id"])
    product = Product.objects.filter(sku=sku).first()

    if batch.skipped and product is None:
        raise BatchIngestSmokeError(
            f"Happy import skipped with no product: "
            f"{[r.to_dict() for r in batch.results]}"
        )

    if product is None:
        raise BatchIngestSmokeError(f"Happy import did not create sku={sku}")

    if product.status == Product.Status.PUBLISHED:
        warnings.append(f"{sku} already published — approve skipped")
    elif product.status == Product.Status.PENDING_REVIEW:
        package = ProductFile.objects.filter(product=product, is_preview=False).first()
        if package is None or not package.storage_path:
            raise BatchIngestSmokeError("Happy product missing private package row.")
        _write_package_bytes(package.storage_path)
        try:
            product = ProductService.approve_product(product, reviewer=reviewer)
        except ProductError as exc:
            raise BatchIngestSmokeError(f"QA approve failed: {exc}") from exc
    else:
        raise BatchIngestSmokeError(
            f"Unexpected status after import: {product.status}"
        )

    return sku, warnings


def run_batch_ingest_smoke(*, apply: bool = False) -> BatchIngestSmokeResult:
    """Validate frozen fixtures + gate expectations; optionally apply happy path."""
    checks: list[BatchIngestSmokeCheck] = []
    checks.extend(_check_fixture_headers())
    if any(not c.ok for c in checks):
        return BatchIngestSmokeResult(checks=tuple(checks))

    checks.extend(_check_gate_dry_run())

    applied = False
    published_sku = ""
    warnings: list[str] = []

    if apply and all(c.ok for c in checks):
        try:
            published_sku, apply_warnings = _apply_happy_path()
            applied = True
            warnings.extend(apply_warnings)
            checks.append(
                BatchIngestSmokeCheck(
                    name="apply_happy_publish",
                    ok=True,
                    detail=f"sku={published_sku} status=published",
                )
            )
        except BatchIngestSmokeError as exc:
            checks.append(
                BatchIngestSmokeCheck(
                    name="apply_happy_publish",
                    ok=False,
                    detail=str(exc),
                )
            )

    return BatchIngestSmokeResult(
        checks=tuple(checks),
        applied=applied,
        published_sku=published_sku,
        warnings=tuple(warnings),
    )
