# Local end-to-end tests (no Docker)

Run the real backend and frontend on this computer with safe settings, then test the whole pricing
pipeline through the API and through a browser. Docker is not needed.

## Safety

`e2e/local/Start-LocalStack.ps1` overrides `backend/.env` with environment variables, so a local run
never touches the real services:

| Real service | Local run |
|---|---|
| Cloudflare R2 buckets | Off (blank R2 settings). Files go to `backend/media` in this checkout |
| Stripe | Simulated (`E2E_STRIPE_SIMULATE=True`, placeholder test keys) |
| Brevo email | Printed to the backend log |
| Sentry, Google sign-in | Off |
| Database | Its own database `assethive_e2e_<name>`, created on first run |

The profile is `test`, which is the only profile in which the seed commands run. The admin signs in
with a password; there is no authenticator in E2E. Never point these scripts at a server.

## Start and stop

From the repository root, in PowerShell:

```powershell
# API only
./e2e/local/Start-LocalStack.ps1 -Name api -BackendPort 8001 -Python <path to backend venv python.exe>
# Backend + frontend (the frontend proxies /api to the backend port)
./e2e/local/Start-LocalStack.ps1 -Name browser -BackendPort 8002 -FrontendPort 5174 -Python <python.exe>

./e2e/local/Stop-LocalStack.ps1 -Name browser
```

Each start:

1. creates the database if it is missing;
2. migrates it and creates the cache table;
3. seeds it again: `seed_e2e_commerce` and `seed_e2e_pricing`;
4. waits until the backend (and the frontend) answer.

Logs are in `%TEMP%\assethive-e2e\<name>\`. Use a different `-Name` and different ports for each
stack running at the same time.

## Accounts and test data

- Admin `e2e-admin@example.com` / `E2eAdminPass123!`. Buyer `e2e-buyer@example.com` /
  `E2eBuyerPass123!` (from `seed_e2e_commerce`).
- `seed_e2e_pricing` resets these models. Categories: E2E Chairs (a subcategory of E2E Furniture)
  and E2E Lighting. Batches: `e2e-pricing-batch-1` and `-2`.

| SKU | Status | Kind | Price | Sale | Polygons |
|---|---|---|---|---|---|
| PRC-FREE-QA | pending_review | free | 0 | | 8,000 |
| PRC-PAID-QA | pending_review | paid | 25 (suggested) | | 50,000 |
| PRC-WAIT-LOW | awaiting_price | paid | 0 (no price) | | 5,000 |
| PRC-WAIT-MID | awaiting_price | paid | 30 (suggested) | | 50,000 |
| PRC-WAIT-HIGH | awaiting_price | paid | 0 (no price) | | 250,000 |
| PRC-WAIT-UNKNOWN | awaiting_price | paid | 15 | | none |
| PRC-LIVE | published | paid | 40 | | 20,000 |
| PRC-LIVE-SALE | published | paid | 50 | 35, ends in 7 days | 60,000 |
| PRC-LIVE-ENDED | published | paid | 60 | 45, ended 1 hour ago | 30,000 |
| PRC-LIVE-FREE | published | free | 0 | | 9,000 |
| PRC-LIVE-UPDATE | published, re-upload in QA | paid | 45 | | 40,000 |

## Tests

- **API journey** (`backend/products/test_e2e_pricing_journey.py`, if present): the Django test
  runner. It does not need the running stack.
- **Browser journey** (`e2e/tests/pricing-*.spec.ts`): Playwright against the frontend port.

```powershell
cd e2e
$env:E2E_BASE_URL = 'http://localhost:5174'
npx playwright test tests/pricing-pipeline.spec.ts
```
