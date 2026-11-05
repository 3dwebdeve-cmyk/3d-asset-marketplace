# Plugin ingest contract

How the Windows plugin uploader talks to the backend. The operator guide is `uploader/README.md`.
This file is the contract that both sides must keep.

## Flow

1. The uploader reads the operator's sheet (Name, Category, Description, optional Version and Plugin ID).
2. It calls `GET /api/v1/catalog-ingest/plugins/next-ids/` for the category codes and the next free number.
3. For each row it checks the plugin folder, assigns `PLG-<CODE>-<NNNNNN>` (or keeps the saved ID),
   builds `plugin.json`, and uploads three objects to Cloudflare R2:
   - `plugins/<ID>/<ID>.zip`: private bucket
   - `plugins/<ID>/thumbnail.<ext>`: public bucket
   - `plugins/<ID>/plugin.json`: private bucket
4. It calls `POST /api/v1/catalog-ingest/plugins/import/` with the batch.
5. The backend creates each plugin as `pending_review` with price `0.00`. An administrator sets the
   price and approves or rejects it in the admin Plugins panel.

Nothing is published by the import. The price is never set by the uploader.

## Authentication

- `Authorization: Api-Key <key>` on both routes.
- The key is created with `python manage.py catalog_api_key create --name <name> --scope plugins`.
- A key has one scope. A `models` key is refused on plugin routes, and a `plugins` key is refused on
  the model route (`/api/v1/catalog-ingest/import/`).
- Keys are stored only as SHA-256 hashes. A revoked key is refused at once.
- Throttled by `CatalogIngestRateThrottle`. Optional IP allowlist: `CATALOG_INGEST_ALLOWED_IPS`.

## GET /api/v1/catalog-ingest/plugins/next-ids/

Response (200):

```json
{
  "last_sequence": 41,
  "next_sequence": 42,
  "categories": [{"code": "ANI", "name": "Animation"}]
}
```

Only active categories that have a code are listed.

## POST /api/v1/catalog-ingest/plugins/import/

Request:

```json
{
  "import_batch_id": "exe-20261104153000-1",
  "import_source": "plugin-uploader",
  "items": [
    {
      "plugin_id": "PLG-ANI-000042",
      "name": "Rig Helper",
      "category_code": "ANI",
      "description": "Helps with rigs.",
      "manifest": {"plugin_id": "PLG-ANI-000042", "version": "2.1", "package_sha256": "..."},
      "media": {
        "thumbnail_key": "plugins/PLG-ANI-000042/thumbnail.webp",
        "package_key": "plugins/PLG-ANI-000042/PLG-ANI-000042.zip",
        "package_file_size": 2048576
      }
    }
  ]
}
```

Limits: at most 200 items per batch; `manifest` at most 20,000 bytes; description at most 20,000
characters.

Response (200):

```json
{
  "import_batch_id": "exe-20261104153000-1",
  "created": 1,
  "updated": 0,
  "skipped": 0,
  "failed": 0,
  "results": [
    {"plugin_id": "PLG-ANI-000042", "action": "created", "id": "<uuid>", "status": "pending_review"}
  ]
}
```

`action` is `created`, `updated`, `skipped` or `failed`. Skipped and failed rows carry a `reason`.

### Row rules

| Rule | Reason code when broken |
|---|---|
| Plugin ID is `PLG-` + three capital letters + `-` + six digits | `invalid_plugin_id` |
| The ID's category code matches `category_code` and an active category has that code | `category_mismatch`, `unknown_category` |
| Thumbnail key is under `plugins/<ID>/` and ends in `.webp`, `.jpg`, `.jpeg` or `.png` | `invalid_object_key` |
| Thumbnail exists and decodes as a real image, at most 25 MB | `missing_thumbnail_object`, `invalid_thumbnail` |
| Package key is exactly `plugins/<ID>/<ID>.zip` and the object exists | `invalid_object_key`, `missing_package_object` |
| The ID is new, or belongs to a plugin still in review or rejected | `plugin_id_in_use` (same ID, different name), `already_reviewed` (any other status: published, draft or archived) |

A plugin that is not waiting for review (published, draft or archived) is never changed by an import. A rejected plugin that is re-imported goes back to
`pending_review` and keeps its old reject reason until the next decision.

## Review (administrators)

- `GET /api/v1/admin/plugins/?status=pending_review`: the queue.
- `POST /api/v1/admin/plugins/<id>/approve/` with `{"price": "24.50", "currency": "", "discount_price": null, "qa_notes": ""}`.
  Price `0` makes the plugin free. Publishes it and records the reviewer and time.
- `POST /api/v1/admin/plugins/<id>/reject/` with `{"reason": "...", "qa_notes": ""}`. The reason is required.
- `POST /api/v1/admin/plugins/<id>/requeue/`: a rejected plugin back to `pending_review`.

All three need an administrator with MFA. Each decision is written to the admin audit log.

## Storage layout

| Object | Bucket | Public? |
|---|---|---|
| `plugins/<ID>/<ID>.zip` | private | no: only through the signed download |
| `plugins/<ID>/plugin.json` | private | no |
| `plugins/<ID>/thumbnail.<ext>` | public | yes, shown on the storefront |

Only the image types under `plugins/` are public (`config/media.py`, `PLUGIN_PUBLIC_SUFFIXES`).

## Known limits

- Files can reach R2 before the import refuses a row. Those files stay in storage and are overwritten
  by a re-run, so nothing is duplicated. Clean up orphans by hand if needed.
- Two uploaders running at the same time can be given the same next number. The second import is then
  refused with `plugin_id_in_use`.
- Zips are not malware-scanned. The package scanner gate (`PACKAGE_SCAN_REQUIRED`) is a separate,
  operational decision.
