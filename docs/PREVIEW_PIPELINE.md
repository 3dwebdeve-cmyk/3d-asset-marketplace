# Preview models

The interactive 3D preview on a product page is public: anyone can download it from the
browser. It must therefore be a reduced model that is useful for viewing but not worth
stealing. The paid package stays private and is only reachable through signed links.

## Rules the app enforces

| Rule | Where |
|---|---|
| Preview triangles ≤ 50% of the product's `polygon_count` (when the count is known) | Admin upload, catalog import, and again at approval |
| Preview file ≤ 25 MB | Admin upload and catalog import |
| Import previews must be `.glb` (self-contained; a `.gltf` with external buffers breaks when moved) | Catalog import |
| A product with a known `polygon_count` cannot be approved with an unmeasured preview | Approval |

The share is `PREVIEW_MAX_POLYGON_SHARE` in `backend/products/services.py`. Triangles are
counted from the glTF accessors; an instanced mesh counts once.

## Building a reduced preview

Use [glTF Transform](https://gltf-transform.dev/) (Node.js):

```
npx @gltf-transform/cli simplify source.glb step1.glb --ratio 0.3 --error 0.001
npx @gltf-transform/cli resize step1.glb step2.glb --width 1024 --height 1024
npx @gltf-transform/cli draco step2.glb preview.glb
```

- `simplify --ratio 0.3` keeps about 30% of the triangles, which leaves a margin under the 50% limit.
- `resize` caps textures at 1024 px; the package keeps the full-resolution maps.
- `draco` compresses the geometry for faster loading.

Check the result before uploading:

```
npx @gltf-transform/cli inspect preview.glb
```

Compare the triangle count in the inspect output with the source model's polygon count.

## Batch imports: the predictable name is removed

The pipeline uploads `models/<Model_ID>/preview.glb`. Anyone can guess that name for any
SKU, including products that are not released yet. During import the app:

1. Reads and measures the preview.
2. Copies it to `models/<Model_ID>/preview-<32 random hex>.glb` and points the product there.
3. Deletes `preview.glb`, and on a re-import also the product's previous random copy.

A rejected preview (`invalid_preview`, `preview_too_large`, `preview_not_reduced`) is deleted
too, so it never stays public under the guessable name. The row is skipped with that reason;
upload a corrected preview and import again.

A re-import without a new `preview.glb` keeps the product's current preview.

## What a preview still reveals

A reduced preview still shows the shape of the model. That is the trade-off of offering an
interactive viewer. For models where even the shape is sensitive, use images or a turntable
video instead of a preview model.
