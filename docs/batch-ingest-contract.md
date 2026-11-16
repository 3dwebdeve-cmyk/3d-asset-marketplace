# Batch Ingest Contract

Contract between the 3D production pipeline and the catalog importer
(`backend/products/catalog_import.py`). Two callers use the same importer:

| Caller | Endpoint | Authentication |
|---|---|---|
| 3ds Max plugin + Windows uploader exe | `POST /api/v1/catalog-ingest/import/` | `Authorization: Api-Key <key>` |
| Administrator (console, scripts) | `POST /api/v1/admin/products/import/` | Administrator JWT with MFA |

Fixtures live in `docs/fixtures/batch-ingest/` (`happy`, `mismatch`, `gate-failures`).

## 3ds Max pipeline

The 3ds Max plugin (Model ID Tool 1.8) reads an Excel sheet (Name, Category, Description and
a YES column per package) and a folder of models. For each model it creates a Model ID and
writes these files:

| File | Contents |
|---|---|
| `<ID>_<kind>.zip` | One zip per package the model has (1 to 5), each sold on its own: `with_light_rig`, `without_light_rig`, `glb_only`, `environment`, `whole` (Whole File, everything) |
| `preview_<ID>.glb` | Optional when the model has a 360°: a light preview model (under 12 MB, not Draco-compressed) |
| `previewthumb_<ID>.jpg` | The thumbnail |
| `<ID>.json` | All product details (the plugin's own record; not uploaded) |
| `360_<ID>_01.jpg` … `360_<ID>_36.jpg` | Optional 360° turntable: exactly 36 frames, 1024 px JPEG, in spin order (Excel column *360 Render* = YES) |

**Model ID format:** `CODE-000000`, for example `ELE-000001`: a category code of 2 to 5
capital letters and one global six-digit counter (older IDs such as `FUR-CHR-000123` also
start with their category code). The plugin creates the ID; the site stores it as the
product's `sku`, uses it to update the same product on re-import, and finds a new model's
category by its code (see "Category").

The uploader exe uploads the files to R2 under `models/<ID>/`, then calls the import:

| Object key | Bucket |
|---|---|
| `models/<ID>/<ID>_<kind>.zip` (one per package) | **private** |
| `models/<ID>/preview_<ID>.glb` | public |
| `models/<ID>/previewthumb_<ID>.jpg` | public |
| `360/<ID>/360_<ID>_01.jpg` … `_36.jpg` | public (paid **and** Free models) |

Upload every zip **before** calling the import: the import checks each one is there.

**Free models** go under `free-models/<ID>/` in the **public** bucket, zip included, with
`r2_key_prefix: "free-models/<ID>/"` and every media key under that prefix. Every package
imports at price 0, QA publishes them as free, and they cannot be published paid. Anyone can download them, without an account, through
`GET /api/v1/products/<slug>/free-download/`, which redirects to the zip.

## Storage layout

- Public objects: `models/<Model_ID>/` (thumbnail, gallery images, preview `.glb`).
- 360° frames: `360/<Model_ID>/360_<Model_ID>_NN.jpg` in the public bucket. Only `.jpg` /
  `.jpeg` files under `360/` are public; anything else there is never served. The frames stay
  under `360/` for Free models too: they never move to `free-models/`, so a Free model's
  `r2_key_prefix` is `free-models/<ID>/` while its `spin_keys` point at `360/<ID>/`.
  Archiving or deleting a product does not delete its frames (like every other R2 file).
- Every `.zip` under `models/` is **private** and served only through signed download
  links (60 seconds). Storage, the local media server and media migrations treat any
  `.zip` there as private.
- Each package key must be exactly `<prefix><Model_ID>_<kind>.zip`, where `<prefix>` is the
  row's `r2_key_prefix`. Any other name skips the row (`invalid_packages`); the old
  `<Model_ID>.zip` and `package.zip` names are no longer packages (existing products were
  converted to Whole File by the 0016 migration). A `.zip` is also rejected as a thumbnail,
  preview or gallery key (`invalid_object_key`).
- The buyer's download is named after the package's `file_name` (by default the key's file
  name, `<Model_ID>_<kind>.zip`).
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
      "price": "0.00",
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
        "package_key": "models/FUR-CHR-000123/FUR-CHR-000123_whole.zip",
        "packages": [
          {"kind": "with_light_rig", "label": "With Light Rig",
           "key": "models/FUR-CHR-000123/FUR-CHR-000123_with_light_rig.zip",
           "file_name": "FUR-CHR-000123_with_light_rig.zip", "file_format": "zip", "file_size": 40500000},
          {"kind": "whole", "label": "Whole File",
           "key": "models/FUR-CHR-000123/FUR-CHR-000123_whole.zip",
           "file_name": "FUR-CHR-000123_whole.zip", "file_format": "zip", "file_size": 48234496}
        ],
        "spin_keys": [
          "360/FUR-CHR-000123/360_FUR-CHR-000123_01.jpg",
          "…",
          "360/FUR-CHR-000123/360_FUR-CHR-000123_36.jpg"
        ]
      }
    }
  ]
}
```

- `price`: the `"0.00"` placeholder. The sheet's price and discount are never read: each
  package is priced on the Pricing page, and a package with no price is not sold.
- `media.packages`: one entry per zip the tool made (1 to 5), each with `kind` (one of
  `with_light_rig`, `without_light_rig`, `glb_only`, `environment`, `whole`), `key`
  (`<prefix><ID>_<kind>.zip`), `file_name`, `file_format` (`zip`) and `file_size` (> 0).
  `label` is accepted and not used: the website names packages itself. No duplicate kinds;
  `media.package_key` (the main zip) must be one of the keys. Otherwise `invalid_packages`.
  More than 10 entries fails the whole request (400).
- An entry whose `kind` is not one of the five (another zip) is not imported. The row goes
  on with the five-kind packages and warns `extra_file_skipped`; the model's QA notes name
  the file, so an administrator can add it by hand in Media → Packages. The main zip can
  never be such an entry (`invalid_packages`).
- `media.preview_key` and `media.spin_keys` (36 frames) are both optional, but a model needs
  at least one of them (`missing_preview`). `glb_checksum` is required only with a preview
  (`missing_glb_checksum`).
- `package_formats`: the model formats inside the zip, lowercase without the dot
  (`fbx`, `max`, `obj`, `blend`, `glb`…). The plugin fills it from the files it packs. The
  site shows them as the product's formats and uses them for the browse page's
  software/format filter. Archive types (`zip`, `rar`, `7z`) are never listed as formats.
- `polygon_count`: read from the **full model** in the package, never from the preview GLB.
  The import rejects a preview with more than 50% of this count (`preview_not_reduced`).
- `category`: the sheet's category name. A new model's category is found by the code in its
  Model ID; the name only links or names a category (see "Category"). There are no
  subcategories in the upload.
- `media.spin_keys`: the 360° frames, in spin order. The same rules apply to paid and Free
  models, and the row's `r2_key_prefix` is not used:

  | Value | Meaning |
  |---|---|
  | absent or `null` | Older plugin: the product keeps its current 360° unchanged. |
  | `[]` | The model has no 360°: the product's 360° is cleared. The uploader then deletes the old `360/<ID>/` frames. |
  | 36 keys | Key *n* must be exactly `360/<ID>/360_<ID>_<nn>.jpg`, `nn` = `01` … `36`, in that order. |

  Any other value (35 or 37 keys, wrong order, another model's ID, a key under `models/` or
  `free-models/`, a `.png`, a blank key) skips the row with `invalid_spin_keys`. More than 50
  keys fails the whole request (400), like `gallery_keys`. The product stores the 36 frame URLs
  as `spin_images` (each with `?v=<hash>`); the product page shows a 360° viewer only when there
  are exactly 36, and the product list returns `has_360` for a "360°" badge.

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
| `category_linked` | The category with the sheet's name had no code; it now has this ID's code, and later models with that code go there. |
| `category_pending_approval` | The category of this code is new (created by this or an earlier upload) and hidden. Approve it in `/console` → Categories before approving the model. |
| `package_needs_price` | A live model got a new package. It is not sold until it has a price on the Pricing page. |
| `extra_file_skipped` | The upload listed a zip that is not one of the five packages. It was not imported; the model's QA notes name it, so an administrator can add it by hand. |
| `preview_unchecked` | The preview was accepted without the 50% reduction check (see Import gate). Send `polygon_count`. |
| `preview_not_scanned` | The preview was imported without a virus scan, because `CATALOG_IMPORT_SCAN_REQUIRED` is `False` and no scanner is configured. Expected while that switch is off. |
| `console_text_kept` | Re-upload only: the sheet's name or descriptions differ from the product's, and the website kept the product's (see Re-import). Change the text in `/console`, not in the sheet. |
| `price_needed` | Re-upload only: the model moved from `free-models/` to `models/`. Its packages have no price; set them on the Pricing page after QA. |
| `live_update_in_qa` | The model is live: it stays on sale and waits in the QA queue as an update (see Re-import). Also set when a live model's re-upload was refused. |

## Import gate

A row is skipped, with a reason, when any of these apply:
`folder_mismatch`, `invalid_model_id`, `exports_incomplete`, `invalid_name`,
`invalid_export_size`, `invalid_currency`, `missing_thumbnail`, `qa_not_ready`,
`missing_glb_checksum`, `invalid_r2_prefix`, `missing_preview`, `invalid_object_key`,
`invalid_packages`, `missing_package_object`, `package_has_buyers`, and the category reasons
below. The texts the admin sees for every reason are in `backend/products/import_reasons.py`.

`package_has_buyers`: a re-upload leaves out a package that someone bought (a paid, not
disputed order line of that package, or one from before packages existed, which covers every
package). The row is refused so the buyer's file stays; keep that zip and upload again. A
package nobody bought may be left out: its row is removed.

## Category

A new model's category comes from the code in its Model ID (`ELE` in `ELE-000001`). The code
belongs to one category for good. A re-upload keeps the product's category and never looks it
up. For a new model, in this order:

1. The code is the part before the first `-`. Not 2-5 capital letters → `invalid_model_id`.
2. A category has the code: an active one is used; a pending one (created by an upload, not
   approved yet) is used with `category_pending_approval`; a rejected one → `category_rejected`;
   one switched off in `/console` → `category_inactive` (never revived).
3. Otherwise the active categories with the sheet's name (case-insensitive, extra spaces
   ignored) and no code: exactly one gets the code once (`category_linked`); more than one →
   `category_ambiguous`. A category with that name and another code → `category_code_mismatch`;
   only switched-off ones → `category_inactive`.
4. No category has the code or the name: the category is **created**, hidden and pending
   (`is_active` false, `pending_approval` true, the batch id recorded), with
   `category_pending_approval`. An empty name, or one over 255 characters, → `category_unmapped`.

An admin approves, merges or rejects new categories in `/console` → Categories ("Waiting for
approval"). A model in a pending or rejected category cannot be approved. Reject deletes an
empty category; one with models stays hidden and refuses new uploads until it is approved or
merged.

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

The 360° frames are checked the same way, so a product never shows a broken spin:

| Reason | Meaning |
|---|---|
| `invalid_spin_keys` | The 360° frame list is wrong: it needs exactly 36 frames named `360/<ID>/360_<ID>_01.jpg` … `_36.jpg`, in order. |
| `missing_spin_object` | A 360° frame is not in the public bucket: upload the model again. |
| `invalid_spin_image` | A 360° frame is not a valid image (or is over 25 MB / 20 megapixels). |

A row that passes can still carry a warning. `preview_unchecked` means the preview was
accepted without the 50% reduction check, because the row has no `Polycount` or the preview's
triangles could not be counted: a full-detail model can become public that way, so send the
`Polycount`. The import also logs `catalog_import_preview_unchecked`.

Passing rows are created or updated as `pending_review`. Publishing always goes through
the review queue (approve action); imports never publish directly.

## Batch size

Each row downloads the preview from R2, scans it and stores it again inside the request; a
row with a 360° also reads its 36 frames (about 36 × 150 KB).
Gunicorn's timeout is 120 seconds and Cloudflare's proxy limit is about 100 seconds, so send
**about 5 models per request**. The importer accepts at most 500 items per request, but
large batches will time out.

## Re-import

- Re-importing the same Model ID updates the product (`pending_review` again).
- **The administrator owns the text.** The sheet's name, short description, description,
  currency, licence, software and feature ticks are used only when the model is first created
  (the category comes from the Model ID's code; prices from the Pricing page). After that they
  are edited in `/console`, and a re-upload updates only the files and what is measured from
  them: thumbnail, preview, gallery, packages, `polygon_count`, `glb_checksum`,
  `package_formats`, the batch ID. Each package keeps its price and sale; a new package has no
  price. When the sheet's text differs, the row carries the warning `console_text_kept`.
- The Free tick still decides the price on a re-upload: a model sent to `free-models/` becomes
  free (every package 0, no sale), because its files are public. A model moved from
  `free-models/` back to `models/` has unpriced packages and carries `price_needed`.
- On the first upload, a trailing "Folders in model folder: …" list (written by the Model ID
  Tool) is removed from the description and short description. For products imported
  before this change, run `python manage.py strip_folder_listings` (dry run), then
  `--apply`.
- **A published (live) model stays on sale.** Its re-upload goes through the same checks and,
  when they pass, the product points at the new files at once (the uploader has already
  replaced them in R2), keeps its text and price, stays `published`, and gets
  `pending_update`. The row reports `"status": "published"` with the warning
  `live_update_in_qa`. The model then appears in the `/console` QA queue (Pending review)
  with an "Update to a live model" badge. **Approve** keeps it on sale and clears the flag;
  **Reject** takes it off the store (`rejected`), and buyers keep their downloads.
- If the website refuses a live model's re-upload (any skip or failure reason), the model is
  still flagged for review with the warning `live_update_in_qa` and a QA note
  ("Re-upload <batch> was refused (<reason>) ..."), because R2 may already serve the refused
  files. The next re-upload that passes removes that note.
- `published_sku` is now only returned for a status the import does not handle.
- An archived product (deleted in `/console` while it had orders) goes back to
  `pending_review` when it is re-imported; its buyers keep their downloads.
- Every skipped or failed model is recorded with its reason in the activity log
  (`skipped_reasons`), and the `/console` QA queue lists the latest imports with those reasons.
- An existing gallery is kept; the import only fills an empty gallery.
- The packages follow `media.packages`: one row per zip, a removed kind is deleted (unless
  someone bought it: `package_has_buyers`).
- `package_formats` is replaced by the value in the batch.
- The 360° follows the `spin_keys` rules above: absent keeps it, `[]` clears it, 36 frames
  replace it. A live model's new 360° is shown at once and waits in the QA queue with its other
  files (`live_update_in_qa`). A refused 360° (any of the reasons above) leaves the product's
  current 360° as it was.

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
`Thumbnail Path`, `Gallery Image Paths`, `License Type`, `Tags`, `PBR Ready`, `Game Ready`,
`Software Used`

`Rigged` and `Animated` were removed on 2026-11-10: the website no longer uses them. An import that still
sends `rigged` or `animated` is accepted, and the values are ignored.

Booleans accept `TRUE`, `1`, `YES` and `Y`. Gallery paths are separated by `|` or `;`.
