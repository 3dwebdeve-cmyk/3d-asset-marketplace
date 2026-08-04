# Happy-path fixture

Expected gate: **PASS** → create/update `Product` as `draft` (never publish).

| Model_ID | Notes |
|----------|--------|
| `MDL-000142` | Matched, GLB+FBX Success, Ready for QA, intake price set, thumbnail.jpg present |

## Files

- `batch-output-report.csv` — report columns (header = contract names; CSV has no Excel title rows)
- `phase1-intake.csv` — intake join on Model_ID
- `folder-tree.txt` — expected layout under Output Folder Path

## Gate checklist

1. Folder Match Status = Matched  
2. Model_ID valid  
3. GLB Success + FBX Success (package format)  
4. Intake price 29.99 USD  
5. thumbnail.jpg via folder convention  
6. QA Status = Ready for QA  
7. Checksum present  
8. R2 Key Prefix = `models/MDL-000142/`
