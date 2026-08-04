# Gate-failure fixtures

Three rows; each fails a different ready-to-import check. Bridge must skip all three.

| Model_ID | Failure |
|----------|---------|
| `MDL-000201` | Required exports — GLB Success but **no** FBX/OBJ/MAX Success |
| `MDL-000202` | Intake — missing / invalid price (blank Price) |
| `MDL-000203` | Thumbnail — no intake path and no `thumbnail.jpg` on disk |

Shared report + intake CSVs contain all three models.
