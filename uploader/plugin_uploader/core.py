"""Pure logic for the plugin uploader: read the sheet, check the files, make IDs and manifests.

Nothing here talks to the network or to R2. The GUI passes in the API and storage clients, so
the whole pipeline can be tested with fakes.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

PLUGIN_ID_RE = re.compile(r"^PLG-[A-Z]{3}-\d{6}$")
CATEGORY_CODE_RE = re.compile(r"^[A-Z]{3}$")
THUMBNAIL_EXTENSIONS = (".webp", ".jpg", ".jpeg", ".png")
MAX_BATCH_ITEMS = 200  # the server refuses bigger batches
REQUIRED_HEADERS = ("name", "category", "description")
CONTENT_TYPES = {
    ".zip": "application/zip",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

# Website reasons (the row was not imported), in words a person can act on.
REASONS = {
    "plugin_id_in_use": "the Plugin ID belongs to another plugin on the website: ask an administrator",
    "unknown_category": "the category is not on the website, or was turned off there",
    "category_mismatch": "the Plugin ID does not match the category",
    "invalid_plugin_id": "invalid Plugin ID",
    "invalid_object_key": "a file path is not under plugins/<ID>/",
    "missing_thumbnail_object": "the website cannot find the image in storage: run again",
    "invalid_thumbnail": "the image is not a real image, or it is too large",
    "missing_package_object": "the website cannot find the zip in storage: run again",
    "import_error": "the website hit an error on this row: try again, then tell an administrator",
    # Older websites only; a re-upload of a published plugin is now accepted as an update.
    "already_reviewed": "already published on the website",
}

# Website warnings (the row was still imported, unless it was skipped), in words.
WARNINGS = {
    "console_text_kept": (
        "the website kept the name and description set in /console (the sheet's text is used "
        "on the first upload only)"
    ),
    "live_update_in_qa": (
        "the plugin is live: it stays on sale with the new files and waits for an administrator "
        "to review the update"
    ),
}


def describe_outcome(outcome: dict[str, Any]) -> str:
    """The report message for one row of the website's answer."""
    warnings = [WARNINGS.get(str(code), str(code)) for code in outcome.get("warnings") or []]
    if outcome.get("action") in ("created", "updated"):
        live = "live_update_in_qa" in (outcome.get("warnings") or [])
        message = f"{outcome['action']}; " + ("still on sale, update waiting for review." if live else "waiting for review.")
    else:
        reason = str(outcome.get("reason") or "")
        message = REASONS.get(reason, reason) or "Not imported."
    if warnings:
        message += " Note: " + "; ".join(warnings) + "."
    return message


class UploaderError(Exception):
    """A problem with the sheet or the files. The message is shown to the operator."""


@dataclass
class SheetRow:
    row_number: int  # 1-based sheet row, for the report
    name: str
    category: str
    description: str
    version: str = "1.0"
    plugin_id: str = ""  # written back after a run, so a re-run reuses the same ID


@dataclass
class Category:
    code: str
    name: str


@dataclass
class PlannedPlugin:
    row: SheetRow
    plugin_id: str
    category_code: str
    package_path: Path
    thumbnail_path: Path


@dataclass
class RowReport:
    row_number: int
    name: str
    plugin_id: str = ""
    status: str = ""  # "ready", "imported", "skipped" or "failed"
    message: str = ""


@dataclass
class BatchReport:
    rows: list[RowReport] = field(default_factory=list)

    def set_status(self, row_number: int, status: str, message: str) -> None:
        for row in self.rows:
            if row.row_number == row_number:
                row.status = status
                row.message = message
                return
        raise UploaderError(f"Internal error: row {row_number} is missing from the report.")


class ApiClient(Protocol):
    def next_ids(self) -> dict[str, Any]: ...
    def import_batch(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class StorageClient(Protocol):
    def put_private(self, key: str, data: bytes, content_type: str) -> None: ...
    def put_public(self, key: str, data: bytes, content_type: str) -> None: ...


# ─── Sheet ─────────────────────────────────────────────────────────────────


def read_rows(sheet: list[tuple[Any, ...]]) -> list[SheetRow]:
    """Parse the sheet's rows; the first row is the header. Blank rows are ignored."""
    if not sheet:
        raise UploaderError("The sheet is empty.")
    header = [str(cell or "").strip().lower() for cell in sheet[0]]
    missing = [name for name in REQUIRED_HEADERS if name not in header]
    if missing:
        raise UploaderError(
            f"The sheet needs the columns Name, Category and Description. Missing: {', '.join(missing)}."
        )
    position = {name: header.index(name) for name in header if name}

    def cell(row: tuple[Any, ...], column: str) -> str:
        index = position.get(column)
        if index is None or index >= len(row):
            return ""
        return str(row[index] or "").strip()

    rows: list[SheetRow] = []
    for number, row in enumerate(sheet[1:], start=2):
        if not any(str(value or "").strip() for value in row):
            continue
        rows.append(
            SheetRow(
                row_number=number,
                name=cell(row, "name"),
                category=cell(row, "category"),
                description=cell(row, "description"),
                version=cell(row, "version") or "1.0",
                plugin_id=cell(row, "plugin id"),
            )
        )
    return rows


def find_category(categories: list[Category], value: str) -> Category | None:
    """Match the sheet's category by its name or its three-letter code, ignoring case."""
    wanted = value.strip().casefold()
    for category in categories:
        if wanted in (category.name.casefold(), category.code.casefold()):
            return category
    return None


# ─── Files ─────────────────────────────────────────────────────────────────


def find_assets(folder: Path) -> tuple[Path, Path]:
    """The plugin's folder must hold one .zip and one image, and nothing else is checked."""
    if not folder.is_dir():
        raise UploaderError(f"No folder named '{folder.name}' in the plugin folder.")
    zips = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".zip")
    images = sorted(
        p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in THUMBNAIL_EXTENSIONS
    )
    if len(zips) != 1:
        raise UploaderError(f"'{folder.name}' must contain exactly one .zip (found {len(zips)}).")
    if len(images) != 1:
        raise UploaderError(
            f"'{folder.name}' must contain exactly one image (.webp, .jpg, .jpeg or .png)."
        )
    return zips[0], images[0]


# ─── IDs and R2 keys ───────────────────────────────────────────────────────


def make_plugin_id(category_code: str, sequence: int) -> str:
    if not CATEGORY_CODE_RE.fullmatch(category_code):
        raise UploaderError(f"Category code '{category_code}' must be three capital letters.")
    if not 1 <= sequence <= 999_999:
        raise UploaderError("The plugin number ran out (limit 999999).")
    return f"PLG-{category_code}-{sequence:06d}"


def package_key(plugin_id: str) -> str:
    return f"plugins/{plugin_id}/{plugin_id}.zip"


def thumbnail_key(plugin_id: str, extension: str) -> str:
    return f"plugins/{plugin_id}/thumbnail{extension.lower()}"


def manifest_key(plugin_id: str) -> str:
    return f"plugins/{plugin_id}/plugin.json"


def new_batch_id(now: datetime | None = None) -> str:
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d%H%M%S")
    return f"exe-{stamp}"


# ─── Planning: check every row before anything is uploaded ────────────────


def plan_batch(
    rows: list[SheetRow],
    *,
    categories: list[Category],
    plugin_root: Path,
    next_sequence: int,
) -> tuple[list[PlannedPlugin], BatchReport]:
    """Check each row and give new ones an ID.

    A row that already has a Plugin ID keeps it, so re-running the sheet updates the same
    plugin instead of making a duplicate. New IDs count up from ``next_sequence``.
    """
    plans: list[PlannedPlugin] = []
    report = BatchReport()
    sequence = next_sequence
    for row in rows:
        try:
            if len(row.name) < 2:
                raise UploaderError("Name must be at least 2 characters.")
            if not row.description:
                raise UploaderError("Description is required.")
            category = find_category(categories, row.category)
            if category is None:
                raise UploaderError(f"Unknown category '{row.category}'.")
            package, thumbnail = find_assets(plugin_root / row.name)

            if row.plugin_id:
                if not PLUGIN_ID_RE.fullmatch(row.plugin_id) or row.plugin_id.split("-")[1] != category.code:
                    raise UploaderError(
                        f"Plugin ID '{row.plugin_id}' does not match category {category.code}."
                    )
                plugin_id = row.plugin_id
            else:
                plugin_id = make_plugin_id(category.code, sequence)
                sequence += 1
            plans.append(
                PlannedPlugin(
                    row=row,
                    plugin_id=plugin_id,
                    category_code=category.code,
                    package_path=package,
                    thumbnail_path=thumbnail,
                )
            )
            report.rows.append(RowReport(row.row_number, row.name, plugin_id, "ready", "Checked."))
        except UploaderError as exc:
            report.rows.append(RowReport(row.row_number, row.name, row.plugin_id, "skipped", str(exc)))
    return plans, report


# ─── Upload and import ─────────────────────────────────────────────────────


def build_manifest(plan: PlannedPlugin, package_bytes: bytes, now: datetime | None = None) -> dict[str, Any]:
    return {
        "plugin_id": plan.plugin_id,
        "name": plan.row.name,
        "category_code": plan.category_code,
        "version": plan.row.version,
        "package_file": plan.package_path.name,
        "package_size": len(package_bytes),
        "package_sha256": hashlib.sha256(package_bytes).hexdigest(),
        "generated_by": "plugin-uploader",
        "generated_at": (now or datetime.now(timezone.utc)).replace(microsecond=0).isoformat(),
    }


def upload_plan(plan: PlannedPlugin, storage: StorageClient) -> dict[str, Any]:
    """Upload the zip (private), the thumbnail (public) and the manifest (private) to R2.

    Returns the ``manifest`` and ``media`` parts of the import item.
    """
    package_bytes = plan.package_path.read_bytes()
    thumb_bytes = plan.thumbnail_path.read_bytes()
    manifest = build_manifest(plan, package_bytes)
    thumb_key = thumbnail_key(plan.plugin_id, plan.thumbnail_path.suffix)

    storage.put_private(package_key(plan.plugin_id), package_bytes, CONTENT_TYPES[".zip"])
    storage.put_public(thumb_key, thumb_bytes, CONTENT_TYPES[plan.thumbnail_path.suffix.lower()])
    storage.put_private(
        manifest_key(plan.plugin_id),
        json.dumps(manifest, indent=2).encode("utf-8"),
        "application/json",
    )
    return {
        "manifest": manifest,
        "media": {
            "thumbnail_key": thumb_key,
            "package_key": package_key(plan.plugin_id),
            "package_file_size": len(package_bytes),
        },
    }


def run_batch(
    rows: list[SheetRow],
    *,
    categories: list[Category],
    plugin_root: Path,
    api: ApiClient,
    storage: StorageClient,
    batch_id: str,
) -> tuple[BatchReport, list[tuple[int, str]]]:
    """Plan, upload and import. Returns the report and the (sheet row, Plugin ID) pairs to save."""
    next_info = api.next_ids()
    plans, report = plan_batch(
        rows,
        categories=categories,
        plugin_root=plugin_root,
        next_sequence=int(next_info["next_sequence"]),
    )

    items: list[dict[str, Any]] = []
    plan_by_id: dict[str, PlannedPlugin] = {}
    for plan in plans:
        try:
            uploaded = upload_plan(plan, storage)
        except Exception as exc:  # noqa: BLE001 - one bad upload must not stop the rest
            report.set_status(plan.row.row_number, "failed", f"Upload failed: {exc}")
            continue
        items.append(
            {
                "plugin_id": plan.plugin_id,
                "name": plan.row.name,
                "category_code": plan.category_code,
                "description": plan.row.description,
                "manifest": uploaded["manifest"],
                "media": uploaded["media"],
            }
        )
        plan_by_id[plan.plugin_id] = plan

    saved: list[tuple[int, str]] = []
    for number, start in enumerate(range(0, len(items), MAX_BATCH_ITEMS), start=1):
        chunk = items[start : start + MAX_BATCH_ITEMS]
        result = api.import_batch(
            {
                "import_batch_id": f"{batch_id}-{number}",
                "import_source": "plugin-uploader",
                "items": chunk,
            }
        )
        for outcome in result.get("results", []):
            plan = plan_by_id.get(outcome.get("plugin_id", ""))
            if plan is None:
                continue
            if outcome.get("action") in ("created", "updated"):
                report.set_status(plan.row.row_number, "imported", describe_outcome(outcome))
                saved.append((plan.row.row_number, plan.plugin_id))
            else:
                report.set_status(plan.row.row_number, "skipped", describe_outcome(outcome))
    return report, saved
