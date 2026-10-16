# Batch Ingest Contract

Contract between the 3D production pipeline and the catalog importer
(`backend/products/catalog_import.py`, `POST /api/v1/admin/products/import/`).
Fixtures live in `docs/fixtures/batch-ingest/` (`happy`, `mismatch`, `gate-failures`).

## A. Batch output report (`batch-output-report.csv`)

Columns, in this order:

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

## Storage layout

- Public objects: `models/<Model_ID>/` (thumbnail, gallery images, `preview.glb`).
- The package must be exactly `models/<Model_ID>/package.zip`. It is **private** and served
  only through signed download links. Any other `package_key` is rejected
  (`invalid_object_key`), because storage treats every other name in the folder as public.
- The import moves `preview.glb` to an unguessable name and deletes the original. The
  preview must be a reduced model; see `PREVIEW_PIPELINE.md`.
- Thumbnail and gallery images are served as WebP. Upload `.webp` to have them used as-is;
  a `.jpg` or `.png` (25 MB, 20 megapixels at most) is converted to
  `<name>-<12 hex>.webp` next to the original, and the product points to the WebP copy.
  The name changes when the image changes, so browsers never show a stale copy; a
  re-import with a new thumbnail deletes the previous WebP copy. An image that is not in
  storage at import time keeps its original key.

## Import gate

A row is skipped, with a reason, when any of these apply:
`folder_mismatch`, `exports_incomplete`, `invalid_price`, `missing_thumbnail`.
Preview checks can also skip a row: `invalid_preview_format`, `missing_preview_object`,
`invalid_preview`, `preview_too_large`, `preview_not_reduced`, `preview_unreadable`.
Image checks can skip a row: `invalid_thumbnail`, `invalid_gallery_image` (not a JPEG/PNG/WebP
image, over 25 MB or over 20 megapixels) and `image_unreadable` (storage error).
Passing rows are created or updated as `pending_review`. Publishing always goes through
the review queue (approve action); imports never publish directly.

## Re-import

- An existing gallery is kept; the import only fills an empty gallery.
- The existing package is kept unless the batch provides a new `package_key`.

## Check

```
docker compose exec web python manage.py check_batch_ingest
docker compose exec web python manage.py check_batch_ingest --apply
```

`--apply` imports the happy fixture and approves it. Use it only on local or staging data.

The backend image does not include `docs/`. In a container, mount the fixtures and set
`BATCH_INGEST_FIXTURES_DIR` to their path. The smoke package is written to private storage
and never overwrites an existing object.
