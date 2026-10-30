# Batch Ingest Contract

Contract between the 3D production pipeline and the catalog importer
(`backend/products/catalog_import.py`). Two callers use the same importer:

| Caller | Endpoint | Authentication |
|---|---|---|
| 3ds Max plugin + Windows uploader exe | `POST /api/v1/catalog-ingest/import/` | `Authorization: Api-Key <key>` |
| Administrator (console, scripts) | `POST /api/v1/admin/products/import/` | Administrator JWT with MFA |

Fixtures live in `docs/fixtures/batch-ingest/` (`happy`, `mismatch`, `gate-failures`).

## 3ds Max pipeline

The 3ds Max plugin reads an Excel sheet (Name, Category, Subcategory, Price, Description)
and a folder of models. For each model it creates a Model ID and writes four files:

| File | Contents |
|---|---|
| `<ID>.zip` | The paid package: every model format and the textures |
| `preview_<ID>.glb` | A light preview model (under 12 MB, not Draco-compressed) |
| `previewthumb_<ID>.jpg` | The thumbnail |
| `<ID>.json` | All product details (the plugin's own record; not uploaded) |

**Model ID format:** `AAA-BBB-000000`, for example `FUR-CHR-000123`: a category code, a
subcategory code and one global six-digit counter. The plugin creates the ID; the site
stores it as the product's `sku` and uses it to update the same product on re-import.

The uploader exe uploads the files to R2 under `models/<ID>/`, then calls the import:

| Object key | Bucket |
|---|---|
| `models/<ID>/<ID>.zip` | **private** |
| `models/<ID>/preview_<ID>.glb` | public |
| `models/<ID>/previewthumb_<ID>.jpg` | public |

Upload the zip **before** calling the import: the import checks it is there.

**Free models** go under `free-models/<ID>/` in the **public** bucket, zip included, with
`r2_key_prefix: "free-models/<ID>/"` and every media key under that prefix. They import
at price 0 (any `price` sent is ignored), QA publishes them as free, and they cannot be
published paid. Anyone can download them, without an account, through
`GET /api/v1/products/<slug>/free-download/`, which redirects to the zip.

## Storage layout

- Public objects: `models/<Model_ID>/` (thumbnail, gallery images, preview `.glb`).
- Every `.zip` under `models/` is **private** and served only through signed download
  links (60 seconds). Storage, the local media server and media migrations treat any
  `.zip` there as private.
- The package key must be exactly `models/<Model_ID>/<Model_ID>.zip` (3ds Max pipeline) or
  `models/<Model_ID>/package.zip` (older bridge). Any other `package_key` is rejected
  (`invalid_object_key`). A `.zip` is also rejected as a thumbnail, preview or gallery key.
- When `package_file_name` is not sent, the buyer's download is named after the package
  key, so a pipeline package downloads as `<Model_ID>.zip`.
- **The import never creates, renames or deletes a file in R2.** It checks the uploaded
  files where they are, and the product points straight at them: `models/<ID>/` holds only
  the uploader's files. The one exception is a preview the virus scanner reports as
  malware, which is deleted (`preview_malware`).
- The preview must be a reduced model; see `PREVIEW_PIPELINE.md`. A rejected preview stays
  in place; the next upload replaces it.
- Thumbnail and gallery images (JPEG, PNG or WebP; 25 MB and 20 megapixels at most) are
  used as uploaded. The file names never change, so each URL carries the first 12 hex
  characters of the file's SHA-256 (`…/previewthumb_<ID>.jpg?v=1a2b3c4d5e6f`): a re-uploaded
  file gets a new URL and browsers never show a stale copy. The preview URL works the same way.
- The thumbnail and every gallery image must already be in the public bucket when you
  import: a row whose image is missing is skipped, so a product never goes in with a broken
  image. A re-import may leave the thumbnail out and keep the one the product already has.
- A re-import replaces the gallery when it is empty or every image in it came from an
  earlier import (`models/<ID>/`). A gallery an administrator added to is left alone.
- Older imports made copies (`<name>-<12 hex>.webp`, `preview-<32 hex>.glb`). A re-import
  deletes the copies its product no longer uses; `python manage.py cleanup_import_copies`
  (dry run by default, `--delete` to act) removes any that nothing points at.

## Uploader API key

The uploader exe runs unattended, so it cannot use the administrator sign-in (MFA), the
admin IP allowlist or Cloudflare Access. It uses an API key instead.

- **Header:** `Authorization: Api-Key <key>`. The key looks like `1a2b3c4d.<secret>`; the
  first part is its prefix.
- **What it can do:** call `POST /api/v1/catalog-ingest/import/`, nothing else. It does not
  work on `/api/v1/admin/products/import/` or any other endpoint, and an administrator JWT
  does not work on the ingest route.
- **Who it acts as:** a service user with the non-admin role `Catalog Uploader`
  (default email `catalog-uploader@service.invalid`). That user is inactive and has no
  password, so it cannot sign in anywhere. Imports and the activity log record this user.
- **Storage:** only a SHA-256 hash of the key is stored. A lost key cannot be shown again;
  revoke it and create a new one.
- **Limits:** `catalog_ingest` throttle, 30 requests per minute. Optional IP allowlist
  `CATALOG_INGEST_ALLOWED_IPS` (comma-separated IPs/CIDRs, empty = any IP).
- **Logging:** each call logs the key prefix, batch id and counts, never the key.

Manage keys on the backend (`docker compose exec web`, or a Render shell / one-off job on a
paid plan). Render's free plan has no shell; there, run the command from a machine whose
environment points at the production database.

```
python manage.py catalog_api_key create --name office-pc   # prints the key once
python manage.py catalog_api_key list                      # prefix, status, last used
python manage.py catalog_api_key revoke --prefix 1a2b3c4d
```

**Which address to call:** the public site domain, for example
`https://<your domain>/api/v1/catalog-ingest/import/`. The Cloudflare Worker forwards `/api`
to Render with the `Authorization` header unchanged and adds the edge secret. With
`EDGE_REQUIRE=true`, a call straight to the `onrender.com` address is refused
(`403 edge_required`). The route is outside `/api/v1/admin/*`, so the Cloudflare Access
application (`console*`, `api/v1/admin/*`, `api/v1/auth/admin/*`) does not cover it; do not
add it there.

## Request

```json
{
  "import_batch_id": "2026-10-26-office-pc-001",
  "import_source": "3dsmax-uploader",
  "items": [
    {
      "model_id": "FUR-CHR-000123",
      "name": "Oak Chair",
      "category": "Furniture",
      "subcategory": "Chair",
      "price": "29.99",
      "currency": "USD",
      "description": "…",
      "polygon_count": 12480,
      "glb_checksum": "<sha256 of the preview>",
      "qa_status": "Ready for QA",
      "folder_match_status": "Matched",
      "r2_key_prefix": "models/FUR-CHR-000123/",
      "package_formats": ["fbx", "max", "obj"],
      "media": {
        "thumbnail_key": "models/FUR-CHR-000123/previewthumb_FUR-CHR-000123.jpg",
        "preview_key": "models/FUR-CHR-000123/preview_FUR-CHR-000123.glb",
        "package_key": "models/FUR-CHR-000123/FUR-CHR-000123.zip",
        "package_file_size": 48234496
      }
    }
  ]
}
```

- `package_formats`: the model formats inside the zip, lowercase without the dot
  (`fbx`, `max`, `obj`, `blend`, `glb`…). The plugin fills it from the files it packs. The
  site shows them as the product's formats and uses them for the browse page's
  software/format filter. Archive types (`zip`, `rar`, `7z`) are never listed as formats.
- `polygon_count`: read from the **full model** in the package, never from the preview GLB.
  The import rejects a preview with more than 50% of this count (`preview_not_reduced`).
- `category` / `subcategory`: matched by name, case-insensitive, among active categories.

## Response

```json
{
  "import_batch_id": "2026-10-26-office-pc-001",
  "created": 1, "updated": 0, "skipped": 0, "failed": 0,
  "results": [
    {
      "model_id": "FUR-CHR-000123",
      "action": "created",
      "product_id": "…",
      "status": "pending_review",
      "warnings": ["subcategory_not_found"]
    }
  ]
}
```

`reason` appears on skipped and failed rows. `warnings` lists every warning for a row and
appears only when there is one. `warning` (a single value) is kept for older callers and
holds `preview_unchecked` when that applies.

| Warning | Meaning |
|---|---|
| `subcategory_not_found` | The subcategory does not exist (or is inactive) under the category. The product was placed in the parent category. Create the subcategory in `/console`, then re-import. |
| `preview_unchecked` | The preview was accepted without the 50% reduction check (see Import gate). Send `polygon_count`. |
| `preview_not_scanned` | The preview was imported without a virus scan, because `CATALOG_IMPORT_SCAN_REQUIRED` is `False` and no scanner is configured. Expected while that switch is off. |

## Import gate

A row is skipped, with a reason, when any of these apply:
`folder_mismatch`, `invalid_model_id`, `exports_incomplete`, `invalid_name`,
`invalid_export_size`, `invalid_price`, `invalid_currency`, `missing_thumbnail`,
`qa_not_ready`, `missing_glb_checksum`, `invalid_r2_prefix`, `missing_preview`,
`category_unmapped`, `invalid_object_key`.

`exports_incomplete`: a row passes when **either** rule passes:

- `package_formats` contains at least one format other than `glb` / `gltf` (3ds Max
  pipeline), or
- `exports.glb` is `Success` and at least one of `exports.fbx`, `exports.obj`,
  `exports.max` is `Success` (older bridge).

`missing_package_object`: the `package_key` is not in the private bucket. Checked before
anything else is changed, so the uploaded preview stays in place for a retry. Upload the zip
and import again.

Preview checks can also skip a row: `invalid_preview_format`, `missing_preview_object`,
`invalid_preview`, `preview_too_large`, `preview_not_reduced`, `preview_unreadable`,
`preview_malware` and `scanner_unavailable`. The preview is checked before the images.
Every rejected preview stays in R2 except a `preview_malware` one, which is deleted.

| Reason | Meaning |
|---|---|
| `preview_malware` | The virus scanner found malware in the preview. The file was deleted. |
| `scanner_unavailable` | The virus scanner is required but not configured, or a configured scanner (`PACKAGE_SCAN_HOST`) could not be reached or did not finish. The file is kept; import again once the scanner is back. Without a scanner this happens only while `CATALOG_IMPORT_SCAN_REQUIRED` is `True`. |

### Virus scan switch: `CATALOG_IMPORT_SCAN_REQUIRED`

Production requires a virus scan of every upload. The setting `CATALOG_IMPORT_SCAN_REQUIRED`
(default `True`) decides what the import does with the preview when **no** scanner is configured
(`PACKAGE_SCAN_HOST` empty):

| Value | No scanner configured | Scanner configured |
|---|---|---|
| `True` (default) | Row skipped: `scanner_unavailable` | Scanned |
| `False` | Imported **unscanned**, with the warning `preview_not_scanned` | Scanned (the switch has no effect) |

With `False` and no scanner, the GLB structure, size and triangle checks still run. The
audit log entry records `preview_not_scanned`, the product's QA notes in `/console` say
*"Preview imported without a virus scan (no scanner configured)."*, and the site logs a
warning at startup. The switch covers the catalog import only (the uploader route and the
administrator import route); admin console uploads always require the scanner. Set it to
`False` only until a ClamAV scanner exists.

Image checks can skip a row: `invalid_thumbnail`, `invalid_gallery_image` (not a JPEG/PNG/WebP
image, over 25 MB or over 20 megapixels), `image_unreadable` (storage error), `missing_thumbnail_object` and
`missing_gallery_object` (the file is not in the public bucket; upload it, then import again).

A row that passes can still carry a warning. `preview_unchecked` means the preview was
accepted without the 50% reduction check, because the row has no `Polycount` or the preview's
triangles could not be counted: a full-detail model can become public that way, so send the
`Polycount`. The import also logs `catalog_import_preview_unchecked`.

Passing rows are created or updated as `pending_review`. Publishing always goes through
the review queue (approve action); imports never publish directly.

## Batch size

Each row downloads the preview from R2, scans it and stores it again inside the request.
Gunicorn's timeout is 120 seconds and Cloudflare's proxy limit is about 100 seconds, so send
**about 5 models per request**. The importer accepts at most 500 items per request, but
large batches will time out.

## Re-import

- Re-importing the same Model ID updates the product (`pending_review` again).
- A published product is skipped (`published_sku`). To replace its files, set it to Draft
  in `/console`, re-upload and re-import, then approve it again.
- An existing gallery is kept; the import only fills an empty gallery.
- The existing package is kept unless the batch provides a new `package_key`.
- `package_formats` is replaced by the value in the batch.

## Browsing

A product in a subcategory (for example Furniture → Chair) appears when a visitor picks
the subcategory and when they pick the parent. Subcategories are listed under their parent
in the browse page's category filter and in the navbar menus.

## Check

```
docker compose exec web python manage.py check_batch_ingest
docker compose exec web python manage.py check_batch_ingest --apply
```

`--apply` imports the happy fixture and approves it. Use it only on local or staging data.

The backend image does not include `docs/`. In a container, mount the fixtures and set
`BATCH_INGEST_FIXTURES_DIR` to their path. The smoke package is written to private storage
before the import and never overwrites an existing object.

## A. Batch output report (`batch-output-report.csv`)

Used by the older bridge. Columns, in this order:

`Model_ID`, `Model Name`, `Category`, `Subcategory`, `Polycount`, `Original Folder Name`,
`Folder Match Status`, `FBX Export`, `OBJ Export`, `glTF Export`, `GLB Export`, `MAX Export`,
`FBX Size (MB)`, `OBJ Size (MB)`, `glTF Size (MB)`, `GLB Size (MB)`, `MAX Size (MB)`,
`GLB Checksum (SHA256)`, `Texture Count`, `Textures Folder Path`, `Output Folder Path`,
`R2 Key Prefix`, `QA Status`, `QA Notes`, `Batch Timestamp`

## B. Intake sheet (`phase1-intake.csv`)

`Model_ID`, `Price`, `Currency`, `Discount Price`, `Short Description`, `Description`,
`Thumbnail Path`, `Gallery Image Paths`, `License Type`, `Tags`, `Rigged`, `Animated`,
`PBR Ready`, `Game Ready`, `Software Used`

Booleans accept `TRUE`, `1`, `YES` and `Y`. Gallery paths are separated by `|` or `;`.
