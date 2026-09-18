# Load smoke checklist (Phase J1)

**Scope:** Light verification of critical paths before launch. Not a full load-test suite.

---

## 1. Paths to hit

| Path | Expect |
|------|--------|
| Home / models browse | 200, list paginated |
| Product detail + 3D viewer | 200, preview loads |
| Public search (`?search=…`) | Hits known published name |
| `POST /api/v1/payments/checkout/` (auth + verified) | Session create OK (test mode) |
| Healthz | 200 |

Optional: repeat browse/detail ~20–50 times manually or with a small script; watch web/worker CPU and Sentry.

---

## 2. If slow

1. Confirm public media via `R2_PUBLIC_BASE_URL` / CDN (not origin Gunicorn).
2. Prefer existing `select_related` / `prefetch_related` patterns — fix proven N+1 only.
3. Confirm Meili healthy (`check_search_config`) so search is not falling back under load.

---

## 3. Sign-off

| Env | Date | Initials | Notes |
|-----|------|----------|-------|
| Staging | | | |
| Production | | | |
