# Load smoke checklist (Phase J1)

**Scope:** Light verification of critical paths before launch. Not a full load-test suite.

**Related:** [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §5, `python manage.py check_load_smoke`, `python manage.py check_search_config`, `python manage.py verify_r2`.

**Does not replace:** a staging/prod host soak with real CDN edge traffic and recording date/initials below.

---

## 0. Automated runner (preferred)

From `backend/` (venv active):

```bash
python manage.py check_load_smoke
# Light soak (browse + detail + search × N):
python manage.py check_load_smoke --iterations 20
# Staging/prod gate (also fails on DEBUG / placeholder advisories):
python manage.py check_load_smoke --iterations 50 --fail-on-warnings
```

Compose:

```bash
docker compose exec web python manage.py check_load_smoke --iterations 20
```

The command reuses existing public product list/detail/search views, healthz, and checkout session create (Stripe `Session.create` is **mocked** — no live charges). It does **not** print secrets.

| Check id | What it asserts |
|----------|-----------------|
| `healthz` | `GET /api/v1/healthz/` → 200 |
| `product_list` | Paginated browse 200; query count ≤ budget (N+1 guard) |
| `product_detail` | Published slug 200; no `storage_path` leak; query budget |
| `search` | `?search=` 200 (Meili or ORM fallback); query budget |
| `public_cdn` | When `R2_ENABLED`: `build_public_media_url` uses `R2_PUBLIC_BASE_URL`; catalog URLs under CDN (frontend placeholders = advisory) |
| `checkout_session` | Auth + verified buyer `POST /api/v1/payments/checkout/` → 201 + `checkout_url` |
| `soak` | Optional `--iterations` repeats list/detail/search; flat query counts |

**Local result (2026-09-19, operator Auto):** `load_smoke OK` with `--iterations 20` after `seed_demo_catalog` (R2 public thumbnails/previews). `DEBUG=True` advisory expected. Staging/prod must re-run with `--fail-on-warnings` after CDN is live.

---

## 1. Paths to hit

| Path | Expect |
|------|--------|
| Home / models browse | 200, list paginated |
| Product detail + 3D viewer | 200, preview loads from CDN / public R2 |
| Public search (`?search=…`) | Hits known published name |
| `POST /api/v1/payments/checkout/` (auth + verified) | Session create OK (test mode / mocked in runner) |
| Healthz | 200 |

Optional: repeat browse/detail ~20–50 times (`--iterations`) or manually; watch web/worker CPU and Sentry.

---

## 2. If slow

1. Confirm public media via `R2_PUBLIC_BASE_URL` / CDN (not origin Gunicorn) — `check_load_smoke` `public_cdn` + `verify_r2`.
2. Prefer existing `select_related` / `prefetch_related` patterns — fix proven N+1 only (runner fails when query budgets are exceeded).
3. Confirm Meili healthy (`check_search_config`) so search is not falling back under load.

---

## 3. Sign-off

| Env | Date | Initials | Notes |
|-----|------|----------|-------|
| Local | 2026-09-19 | Auto | `check_load_smoke --iterations 20` OK; R2 public demo URLs; no N+1 budget breach (list≈2 / detail≈3 queries); checkout mocked |
| Staging | | | |
| Production | | | |
