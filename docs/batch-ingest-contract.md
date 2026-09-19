# Batch Catalog Ingest Contract

**Feature:** 16 Phase 4  
**Status:** Frozen 2026-08-04 (report + gate); Phase 1 intake columns signed off **2026-09-19** (I3)  
**Single source of truth** for Batch Output Report columns, Phase 1 intake columns, folder layout, R2 keys, ready-to-import gate, and upsert rules.

Downstream phases (5–8) must implement against this document. Do not change columns or gate rules without updating this file and fixtures.

**Related code (Phase 3):** `Product.sku` ↔ `Model_ID`; `ProductService.get_by_sku` for idempotent upsert; SKU regex `^[A-Z0-9][A-Z0-9_-]*$` (uppercase after normalize).

**Fixtures:** `docs/fixtures/batch-ingest/`

---

## Hard rules

1. `Model_ID` is the only join key across intake, report, R2 keys, and `Product.sku`.
2. Bridge / import **never** sets `Product.status = published`. Catalog create/update stays `draft` (or later `pending_review`). Website admin QA is the final publish gate.
3. Paid packages are **never** public R2 objects.
4. After successful catalog create/update, bridge may set report `QA Status` = `Uploaded`; product remains non-live.

---

## A. Batch Output Report (post-render)

| Item | Locked value |
|------|----------------|
| Workbook | *Batch Output Report — MaxScript Batcher → R2 Bridge* |
| Sheet | `Batch Output Report` |
| Header row | **4** (rows 1–3 = title / metadata; data starts row 5) |
| Granularity | One row per exported model |

### Columns (locked)

| Column | Required | Maps to / bridge behavior |
|--------|----------|---------------------------|
| `Model_ID` | Yes | `Product.sku`. Normalize uppercase. Must match `^[A-Z0-9][A-Z0-9_-]*$`. Example: `MDL-000142`. |
| `Model Name` | Yes | `Product.name` |
| `Category` | Yes | Resolve to `categories.Category` by **name** (case-insensitive). Fail gate if unmapped. |
| `Subcategory` | No | If non-blank: prefer child category under `Category` when tree supports it; else append to notes / ignore until subcategory field exists. |
| `Polycount` | No | `Product.polygon_count` (integer; blank → null) |
| `Original Folder Name` | No | Traceability only |
| `Folder Match Status` | Yes | Must be `Matched` to import. Values: `Matched` \| `Mismatch`. Skip `Mismatch`. |
| `FBX Export` | Yes | Status: `Success` \| `Failed` \| `Skipped` \| blank |
| `OBJ Export` | Yes | Same status enum |
| `glTF Export` | Yes | Same status enum |
| `GLB Export` | Yes | Same status enum; required for preview |
| `MAX Export` | Yes | Same status enum |
| `FBX Size (MB)` | No | Sanity: if export `Success`, size must be > 0 |
| `OBJ Size (MB)` | No | Same |
| `glTF Size (MB)` | No | Same |
| `GLB Size (MB)` | No | Same; required when `GLB Export` = `Success` |
| `MAX Size (MB)` | No | Same |
| `GLB Checksum (SHA256)` | Yes when GLB Success | Hex SHA-256 of local `preview.glb`. Stored as `Product.glb_checksum`. Bridge verifies before + after upload. |
| `Texture Count` | No | Informational |
| `Textures Folder Path` | No | Relative to `Output Folder Path` or absolute; default relative `textures/` |
| `Output Folder Path` | Yes | Absolute or batch-root-relative path to the per-model folder on disk |
| `R2 Key Prefix` | Yes | Must equal `models/{Model_ID}/` (trailing slash). Bridge ignores divergent prefixes or fails the row. |
| `QA Status` | Yes | See lifecycle below |
| `QA Notes` | No | Free text; may copy to import notes later |
| `Batch Timestamp` | No | ISO-8601 or MaxScript export time; stored conceptually as batch run id source |

### QA Status lifecycle (report column)

```text
Not Ready → Ready for QA → Approved | Rejected → Uploaded
```

| Value | Meaning |
|-------|---------|
| `Not Ready` | Do not import |
| `Ready for QA` | Eligible for bridge import (with other gate checks) |
| `Approved` | Eligible for bridge import (pre-approved offline; site still must publish) |
| `Rejected` | Do not import |
| `Uploaded` | Bridge already created/updated catalog row; do not duplicate unless re-import/upsert intentionally |

---

## B. Phase 1 intake Excel (pre-render / catalog)

Carries store fields **not** in the batch report. Join on `Model_ID`.

**Sign-off (I3):** Columns below are **locked** for day-1 Feature 16.  
Frozen **2026-09-19** · Initials **Auto** (operator local smoke via `manage.py check_batch_ingest`).  
Renames require updating this file, fixtures under `docs/fixtures/batch-ingest/`, and the bridge parser together.

| Column | Required | Status | Maps to |
|--------|----------|--------|---------|
| `Model_ID` | Yes | Locked | Join key → `Product.sku` |
| `Price` | Yes | Locked | `Product.price` (decimal ≥ 0) |
| `Currency` | Yes | Locked | `Product.currency` (ISO 4217, default `USD` if blank) |
| `Discount Price` | No | Locked | `Product.discount_price` (null if blank) |
| `Short Description` | No | Locked | `Product.short_description` (max 500) |
| `Description` | No | Locked | `Product.description` |
| `Thumbnail Path` | No | Locked | Relative to `Output Folder Path` or absolute. If blank, use folder convention `thumbnail.jpg`. |
| `Gallery Image Paths` | No | Locked | Pipe- or semicolon-separated relative paths; optional extra `ProductImage` rows |
| `License Type` | No | Locked | `standard` \| `extended` \| `editorial` → `Product.license_type` (default `standard`) |
| `Tags` | No | Locked | Comma- or semicolon-separated; deferred until tags model exists (store in notes / ignore for v1 import) |
| `Rigged` | No | Locked | `Product.rigged` (`TRUE`/`FALSE`/`1`/`0`) |
| `Animated` | No | Locked | `Product.animated` |
| `PBR Ready` | No | Locked | `Product.pbr_ready` |
| `Game Ready` | No | Locked | `Product.game_ready` |
| `Software Used` | No | Locked | `Product.software_used` |

Header row for CSV fixtures: **row 1**. Excel intake sheet name: **`Intake`** (locked).

---

## C. Folder layout under `Output Folder Path`

Per-model root (example: `…/MDL-000142/`):

```text
{Output Folder Path}/
├── preview.glb          # required when GLB Export = Success (public preview)
├── thumbnail.jpg        # default thumbnail if intake Thumbnail Path blank
├── package.zip          # paid download package (preferred single archive)
├── textures/            # optional; included inside package.zip when possible
│   └── …
├── source/              # optional working files (MAX/FBX/OBJ) if not only in zip
│   ├── model.fbx
│   ├── model.obj
│   └── model.max
└── gallery/             # optional extra images
    └── *.jpg|*.png
```

### Locked filenames

| Path | Required when | R2 visibility (later Feature 14) |
|------|---------------|----------------------------------|
| `preview.glb` | `GLB Export` = `Success` | **Public** bucket → `Product.preview_model` |
| `thumbnail.jpg` | Gate needs thumbnail and intake path blank | **Public** → `Product.thumbnail` / `ProductImage` |
| `package.zip` | Preferred paid package | **Private** → `ProductFile` (`is_preview=False`) |
| `textures/` | Optional | **Private** (usually inside `package.zip`) |
| `source/*` | Optional if formats exist only unpacked | **Private** |

**Thumbnail resolution order:** (1) intake `Thumbnail Path` if file exists; (2) `{Output Folder Path}/thumbnail.jpg`; (3) fail gate.

**Package resolution order:** (1) `package.zip` if present; (2) else zip built by bridge from successful export files under `source/` + `textures/` (Phase 5 detail); gate still requires ≥1 package format Success per policy below.

---

## D. R2 key convention

| Concern | Locked value |
|---------|----------------|
| Prefix | `models/{Model_ID}/` (trailing slash; `Model_ID` uppercase) |
| Report column | `R2 Key Prefix` **must** match this pattern for the row’s `Model_ID` |
| Public objects | `models/{Model_ID}/preview.glb`, `models/{Model_ID}/thumbnail.jpg`, `models/{Model_ID}/gallery/…` |
| Private objects | `models/{Model_ID}/package.zip` (and any private extras under same prefix) |

Django may still expose CDN/public URLs for preview/thumb only; private keys never appear on public APIs.

---

## E. Ready-to-import gate

Import a row **only** when **all** checks pass. Otherwise skip and record reason in bridge manifest.

| # | Check | Pass condition |
|---|--------|----------------|
| 1 | Folder match | `Folder Match Status` = `Matched` |
| 2 | Model_ID | Non-blank; normalizes to valid `Product.sku` regex |
| 3 | Required exports | See **Required-export policy** below |
| 4 | Intake | Matching intake row exists; `Price` present and ≥ 0; `Currency` valid or default `USD` |
| 5 | Thumbnail | Resolved via resolution order in §C |
| 6 | QA Status | ∈ {`Ready for QA`, `Approved`} |
| 7 | Checksum | If `GLB Export` = `Success`: `GLB Checksum (SHA256)` non-blank and matches file bytes |
| 8 | R2 prefix | `R2 Key Prefix` = `models/{Model_ID}/` |
| 9 | Preview file | `preview.glb` exists under `Output Folder Path` when GLB required |

### Required-export policy (LOCKED)

**Policy: GLB + at least one download package format.**

- `GLB Export` = `Success` (preview), **and**
- At least one of `FBX Export`, `OBJ Export`, or `MAX Export` = `Success`

`glTF Export` is optional for the gate (GLB covers web preview).  
**Not required:** all five formats Success.

Rationale: marketplace needs a web preview (GLB) and at least one DCC/package delivery format; forcing MAX+FBX+OBJ+glTF+GLB would reject too many valid batch rows.

### Size sanity

When an export column is `Success`, corresponding size (MB) if present must be > 0. Missing size columns do not fail the gate if the file exists on disk.

---

## F. Join + upsert rules

1. Join intake row + report row + disk folder + R2 keys on `Model_ID` (after uppercase normalize).
2. Lookup existing product: `ProductService.get_by_sku(Model_ID)`.
3. If found and status is `draft` (or later `pending_review` / non-published): **update** fields and media pointers; do not create a second row.
4. If found and `published` or `archived`: bridge default = **skip** (or update media only under an explicit `--force-published` flag in Phase 5 — not default).
5. If not found: **create** `Product` with `status=draft`, set `sku`, import metadata (`import_batch_id`, `import_source`, `glb_checksum`, `has_*` flags).
6. Blank `Product.sku` remains allowed for manually created admin products (null SKU); batch rows always set SKU.
7. Never auto-publish.

---

## Category mapping rules

1. Match `Category` column to `categories.Category.name` (trim, case-insensitive).
2. Prefer active categories only.
3. If `Subcategory` set and a child category exists under the matched parent: use child.
4. Unmapped category → gate fail for that row (do not invent categories in v1 bridge).

---

## Fixture index

| Scenario | Path | Expected gate |
|----------|------|----------------|
| Happy path | `docs/fixtures/batch-ingest/happy/` | Pass → import as draft |
| Mismatch skip | `docs/fixtures/batch-ingest/mismatch/` | Skip (`Folder Match Status`) |
| Gate failures | `docs/fixtures/batch-ingest/gate-failures/` | Skip (export / price / thumbnail) |

See each folder’s `README.md`.

---

## Out of scope (this contract phase)

- Cloudflare R2 wiring, bridge CLI, import API, admin QA UI, new Product statuses.
