# Batch ingest fixtures

Sample CSV + folder trees for Feature 16 Phase 4 contract tests (Phase 5+ parsers).

| Folder | Purpose |
|--------|---------|
| `happy/` | Matched / Success / Ready for QA — should import as draft |
| `mismatch/` | Folder Match Status = Mismatch — skip |
| `gate-failures/` | Failed package export, missing price, missing thumbnail — skip |

Contract: [`docs/batch-ingest-contract.md`](../../batch-ingest-contract.md)
