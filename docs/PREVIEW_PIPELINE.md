# Preview models

The interactive 3D preview on a product page is public: anyone can download it from the
browser. It must therefore be a reduced model that is useful for viewing but not worth
stealing. The paid package stays private and is only reachable through signed links.

## Rules the app enforces

| Rule | Where |
|---|---|
| Preview triangles ≤ 50% of the product's `polygon_count`. When the count is unknown the check is skipped, and an import reports `warning: preview_unchecked` | Admin upload, catalog import, and again at approval |
| Preview file ≤ 25 MB | Admin upload and catalog import |
| Import previews must be `.glb` (self-contained; a `.gltf` with external buffers breaks when moved) | Catalog import |
| Previews must **not** be Draco-compressed (they would not display; see below) | 3ds Max plugin refuses them |
| A product with a known `polygon_count` cannot be approved with an unmeasured preview | Approval |

The share is `PREVIEW_MAX_POLYGON_SHARE` in `backend/products/services.py`. Triangles are
counted from the glTF accessors; an instanced mesh counts once.

## Building a reduced preview

Use [glTF Transform](https://gltf-transform.dev/) (Node.js):

```
npx @gltf-transform/cli simplify source.glb step1.glb --ratio 0.3 --error 0.001
npx @gltf-transform/cli resize step1.glb preview.glb --width 1024 --height 1024
```

- `simplify --ratio 0.3` keeps about 30% of the triangles, which leaves a margin under the 50% limit.
- `resize` caps textures at 1024 px; the package keeps the full-resolution maps.
- Keep the file under 12 MB (the 3ds Max plugin's target; the hard limit is 25 MB).

**Do not use Draco compression** (`draco`, or `optimize` without `--compress false`). The
viewer (`useGLTF`) would load the Draco decoder from `www.gstatic.com`, which the site's
Content Security Policy blocks, so a Draco preview does not display. The 3ds Max plugin
refuses Draco GLBs.

Check the result before uploading:

```
npx @gltf-transform/cli inspect preview.glb
```

Compare the triangle count in the inspect output with the source model's polygon count.

## Batch imports: the preview is used where it is

The pipeline uploads `models/<Model_ID>/preview_<Model_ID>.glb` (3ds Max uploader) or
`models/<Model_ID>/preview.glb` (older bridge). During import the app reads, scans and
measures the preview **in place**, and the product points straight at that file, with
`?v=<12 hex of its SHA-256>` added so a re-uploaded preview is never served stale. The import
never copies, renames or deletes it.

A rejected preview (`invalid_preview`, `preview_too_large`, `preview_not_reduced`,
`scanner_unavailable`) stays in R2; the row is skipped with that reason, and the next upload
replaces the file. Only a preview the virus scanner reports as malware is deleted
(`preview_malware`).

**Trade-off:** these names can be guessed for any SKU. A draft's preview is reachable before
the product is released, and a rejected full-detail preview (`preview_not_reduced`) stays
public until it is replaced. Keep previews reduced at export time.

Older imports moved previews to `preview-<32 hex>.glb`. A re-import deletes the product's old
copy; `python manage.py cleanup_import_copies --delete` removes any left over.

A re-import without a new preview upload keeps the product's current preview.

The triangle limit compares the preview with the product's `polygon_count`. The plugin
reads that count from the **full model** in the package, never from the preview GLB.

## What a preview still reveals

A reduced preview still shows the shape of the model. That is the trade-off of offering an
interactive viewer. For models where even the shape is sensitive, use images or a turntable
video instead of a preview model.
