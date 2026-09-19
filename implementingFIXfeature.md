# Launch Readiness — Implementation Fix Plan

**Document:** `implementingFIXfeature.md`  
**Project:** 3D Asset Marketplace  
**Purpose:** Pin-to-pin implementation plan for every launch-blocking and launch-recommended fix identified in the architecture / launch-readiness review.  
**Related:** `docs/PRODUCTION_CHECKLIST.md`, `.cursor/Security_Checklist.md`, `.cursor/rules.md`, `PROJECT_STATUS.md`, `IMPLEMENTATION_ROADMAP.md`

---

## 0. Standing rules (apply to every phase)

### 0.1 Always reuse — never reinvent

Before creating any new file, class, component, serializer, model, service, utility, hook, or API:

1. **Search the existing project** (backend apps, `frontend/src/api`, `frontend/src/components`, `frontend/src/lib`, `frontend/src/hooks`, `config/`, `docs/`).
2. **Reuse** existing implementations whenever possible — extend, wrap, or compose them.
3. **Do not duplicate** helpers already present (examples to prefer):
   - Backend: `config/media.resolve_private_download`, `config/storages.generate_private_presigned_url`, `config/idempotency`, `accounts.authentication.VersionedJWTAuthentication`, `accounts.permissions`, `enqueue_after_commit` patterns in tasks, payment `CheckoutService` / `webhook_service`, download entitlement services, search `sync_product` / `reindex_search`.
   - Frontend: `api/client.ts` (axios + refresh), `lib/roles.ts`, `lib/safePostLoginPath.ts`, `routes/ProtectedRoute` / `AdminRoute`, `components/ui/*`, `hooks/useCart` / `useBuyNow` / `useWishlist`, `components/viewer/LazyModelViewer`, existing Zod schemas and form hooks.
4. Prefer **one shared module** over copy-paste across products/plugins/admin/customer.
5. If a near-duplicate exists (e.g. `ProductCtaGroup` vs `PluginCtaGroup`), **extract a shared primitive** and thin wrappers — do not rewrite both pages from scratch.

### 0.2 Do not break what already works

1. **No drive-by refactors** outside the phase scope.
2. Keep existing public API contracts (`/api/v1/…`) stable unless a phase explicitly versions or documents a breaking change.
3. Prefer **additive** changes (new route alias + redirect) over silent renames without redirects.
4. Preserve working paths: JWT cookie refresh, Stripe webhook idempotency, signed downloads, email Celery queue, Meili fallback, Compose healthz.
5. After each phase: run the **relevant existing tests** (backend app tests, frontend Vitest, Playwright checkout) before marking Done.
6. Local Vite (`npm run dev` + `runserver`) must keep working; Compose must keep working — fix both when touching routing/Nginx.
7. Never commit secrets (`.env`); only update `.env.example` with placeholders and comments.
8. Do not disable security controls (throttles, entitlement checks, webhook signature) to “make launch easier.”

### 0.3 Definition of Done (every phase)

- [ ] Code/config/docs updated as listed  
- [ ] Existing tests still pass for touched areas  
- [ ] New/adjusted tests cover the fix  
- [ ] Manual smoke steps in the phase pass  
- [ ] `PROJECT_STATUS.md` / this file checkbox updated when the phase is complete  

### 0.4 Severity legend

| Tag | Meaning |
|-----|---------|
| **BLOCKER** | Must complete before public launch |
| **MUST** | Required for trustworthy marketplace launch |
| **SHOULD** | Strongly recommended before or immediately after launch |
| **NICE** | Polish; may ship after launch |

### 0.5 Recommended execution order

```
Phase A (BLOCKER code) → Phase B (ops env staging) → Phase C–E (payments/storage/auth)
→ Phase F (search) → Phase G (security/monitoring) → Phase H (catalog/data)
→ Phase I (SHOULD hardening) → Phase J (NICE polish) → Phase K (prod cutover)
```

---

## Phase A — Infrastructure routing (BLOCKER)

### A1. Fix Nginx `/admin/` vs React admin SPA collision

| Field | Detail |
|-------|--------|
| Severity | **BLOCKER** |
| Problem | `frontend/nginx.conf` `location /admin/` proxies to Django; Django `config/urls.py` mounts `admin.site.urls` at `/admin/`; React SPA also uses `/admin/*`. Deep links / refresh break in Compose/prod. |
| User scenario | Staff open or refresh `yoursite.com/admin/products` and get Django admin or 404 instead of the marketplace control panel. Day-1 ops (QA approve, orders, custom projects) fail. |

#### Decision (choose one; document in checklist)

**Option A — Preferred (least Django churn):** Move SPA admin UI to `/console/*`; keep Django at `/admin/`.

**Option B:** Move Django to `/django-admin/`; remove Nginx `/admin/` proxy so SPA owns `/admin/*`.

#### Implementation steps (Option A — preferred)

1. **Inventory** all SPA references to `/admin` (routes, nav, redirects, tests, emails/docs):
   - `frontend/src/App.tsx`
   - `frontend/src/config/adminNav.ts`
   - `frontend/src/lib/roles.ts` / post-login path helpers
   - `frontend/src/routes/AdminRoute.tsx`
   - Admin pages that `navigate('/admin…')`
   - Vitest files asserting `/admin/login`
   - Docs mentioning SPA `/admin`
2. **Introduce constants** (reuse pattern — single source of truth):
   - e.g. `frontend/src/config/adminPaths.ts` → `ADMIN_BASE = '/console'`, `ADMIN_LOGIN = '/console/login'`
   - Replace hardcoded path strings with these constants.
3. **Update routes** in `App.tsx`: `/console`, `/console/login`, nested admin routes under `/console/…`.
4. **Keep temporary redirects** (non-breaking): old `/admin` and `/admin/*` SPA paths → `/console/*` via React Router `Navigate` **only in Vite/dev**. In Compose, old `/admin` still hits Django — document that bookmarks must move to `/console`.
5. **Nginx:** leave `location /admin/` → Django (Option A). Confirm SPA fallback `location /` still serves `/console`.
6. **Do not change** backend API paths `/api/v1/admin/…` — those are REST, not the SPA.
7. **Tests:** update AdminLogin and any path assertions; add a small test that `ADMIN_BASE` is used.
8. **Docs:** update `docs/PRODUCTION_CHECKLIST.md` with final SPA admin URL; note Django admin URL.

#### Implementation steps (Option B — alternative)

1. Change Django `path("admin/", …)` → `path("django-admin/", …)`.
2. Nginx: change `location /admin/` to `location /django-admin/`; **remove** proxy for `/admin/` so SPA `try_files` owns `/admin`.
3. Keep SPA routes at `/admin/*` (minimal frontend churn).
4. Document Django admin at `/django-admin/`; restrict access (VPN / strong password / disable if unused).

#### Reuse

- Existing `AdminRoute`, `AdminLayout`, `adminNav`, `adminLoginUser` API — only path prefixes change.
- Do not rewrite admin pages.

#### Smoke (Compose)

- [ ] `docker compose up` → open `/console/login` (or `/admin/login` if B)  
- [ ] Hard refresh `/console/products`  
- [ ] Open link in new tab  
- [ ] Django still reachable at `/admin/` (A) or `/django-admin/` (B)  
- [ ] Vite local still works  

#### Status

- [x] Done (2026-09-18) — SPA admin at `/console`; Django remains `/admin/`; Vite legacy redirect; `robots.txt` + noindex on console

---

### A2. Production secrets, hosts, TLS (operator + template clarity)

| Field | Detail |
|-------|--------|
| Severity | **BLOCKER** |
| Problem | Templates default to local-safe values; live host not signed off. |
| User scenario | Weak secrets, wrong hosts, or HTTP-only cookies → auth/payment breakage or security incident. |

#### Implementation steps

1. Treat `docs/PRODUCTION_CHECKLIST.md` §1 as the source of truth — **do not invent new env vars**.
2. On staging/prod `.env` (never commit): set `SECRET_KEY`, `DB_PASSWORD`, `MEILI_MASTER_KEY`, `ALLOWED_HOSTS`, `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `PUBLIC_API_BASE_URL`, `CSRF_TRUSTED_ORIGINS`, TLS flags when ready.
3. Optionally improve `.env.example` comments only (placeholders stay non-secret).
4. Run `manage.py check --deploy` on host → zero issues.
5. Confirm Postgres/Redis/Meili/Gunicorn not publicly exposed.

#### Reuse

- Existing settings reads in `backend/config/settings.py` — extend validation only if needed (see A3 hardening).

#### Status

- [x] Tooling + docs (2026-09-18) — `check_deploy_config` (+ `--django-deploy-check` / `--fail-on-warnings`); deploy system checks `config.E001`/`E002`/`W001`; `docs/DEPLOY_SECRETS_STAGING_CHECKLIST.md`; PRODUCTION_CHECKLIST §1/§2.1; `.env.example` comments
- [x] Compose + checker clarity (2026-09-19) — `CSRF_TRUSTED_ORIGINS` / `SECURE_HSTS_SECONDS` wired on web+worker; HSTS local default `0`; `check_deploy_config` reports + warns on `ALLOW_LOCALHOST_FRONTEND` / `ALLOW_CONSOLE_EMAIL`; only SPA port published
- [ ] Operator: set live host secrets / hosts / TLS; `check_deploy_config --fail-on-warnings`; `check --deploy` zero issues; confirm data-plane ports private on the host/SG

---

### A3. Real SMTP + refuse console in production

| Field | Detail |
|-------|--------|
| Severity | **BLOCKER** (SMTP) / **SHOULD** (code guard) |
| Problem | Default console backend; verification/receipts never reach users. |
| User scenario | Customer cannot verify email → cannot checkout; paid users get no receipt. |

#### Implementation steps

1. Set SMTP on **web and worker** per checklist §1 Email.
2. Set `PROJECT_MESSAGE_ADMIN_RECIPIENTS` / `CONTACT_ADMIN_RECIPIENTS`.
3. Restart both; trigger password-reset or contact → real inbox delivery.
4. **Code SHOULD:** In settings or `health.py`, when `DEBUG=False`, fail loudly if `EMAIL_BACKEND` contains `console` (reuse healthz pattern already used for Redis/Meili).
5. Keep console backend allowed for `DEBUG=True` and tests.

#### Reuse

- Existing Celery mail tasks (`accounts/tasks.py`, `orders/tasks.py`, `custom_projects/tasks.py`, `contact/tasks.py`) and `enqueue_after_commit` — do not rewrite mail sending.

#### Status

- [x] Tooling + docs (2026-09-18) — `check_email_config` (+ `--send-test-email` / `--fail-on-warnings`); `docs/SMTP_STAGING_CHECKLIST.md`; PRODUCTION_CHECKLIST §1/§2.4; `.env.example` comments
- [x] Code guard (`ALLOW_CONSOLE_EMAIL` + ImproperlyConfigured when DEBUG=False)
- [ ] Operator: set SMTP + recipients on web/worker; `check_email_config --fail-on-warnings`; one real inbox smoke
- **Deferred (2026-09-19):** skip live SMTP setup for now (no provider credentials yet). Task remains in this plan — do **not** remove. Resume via `docs/SMTP_STAGING_CHECKLIST.md` before staging launch / checkout-with-verification.

---

### A4. Celery worker reliability

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Worker has no Compose healthcheck; silent death stops mail. |
| User scenario | Site up, emails stop overnight. |

#### Implementation steps

1. Verify `worker` Up; `celery -A config inspect ping`.
2. Add Compose healthcheck using existing Celery app (`config`), e.g. ping command — mirror `web` healthcheck style.
3. Document alert expectation in checklist.

#### Reuse

- Existing `config/celery.py` and worker command in `docker-compose.yml`.

#### Status

- [x] Compose Celery `inspect ping` healthcheck enabled (2026-09-18)

---

### A5. Backup + restore drill

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Script exists; schedule + proven restore are operator work. |
| User scenario | Data loss with no practiced recovery. |

#### Implementation steps

1. Run `backend/scripts/backup_postgres.sh`; optional `BACKUP_UPLOAD_R2=1`.
2. Restore on staging disposable volume; migrate; healthz; smoke login.
3. Cron daily backups; document retention.
4. Confirm R2 object recovery is separate from Postgres.

#### Reuse

- Existing `backup_postgres.sh`, `upload_backup_to_r2.py`, `config/test_backup_scripts.py` — do not rewrite.

#### Status

- [x] Tooling + docs (2026-09-18) — `BACKUP_RETENTION_DAYS` prune on backup script; disposable `restore_postgres_drill.sh`; `docs/BACKUP_RESTORE_DRILL.md` (cron + retention + R2≠DB); PRODUCTION_CHECKLIST §2.6; `.env.example` comments
- [x] Local operator drill (2026-09-19) — dump `BACKUP_VIA_COMPOSE=0` (239517 bytes) + `RESTORE_DRILL_MODE=local` (43 public tables); CRLF-safe dotenv; `install_backup_cron.sh` (+ dry-run); R2≠DB confirmed in runbook
- [ ] Staging/prod host: in-place restore → migrate → healthz → smoke login/browse; install live crontab; optional `BACKUP_UPLOAD_R2=1` + R2 lifecycle

---

### A6. Separate Redis DB indexes (SHOULD)

| Field | Detail |
|-------|--------|
| Severity | **SHOULD** |
| Problem | Cache/throttles/idempotency share Redis with Celery broker. |
| User scenario | Harder ops under load; key-space confusion. |

#### Implementation steps

1. Broker: `redis://redis:6379/0`; cache: `…/1` (or document chosen split).
2. Update `docker-compose.yml` web/worker env and `.env.example`.
3. Confirm settings map `CACHES` / Celery broker correctly — reuse existing settings keys; only change URLs.
4. Re-test throttles, checkout idempotency, Celery email.

#### Status

- [x] Done (2026-09-18) — `REDIS_URL` DB1 cache; `CELERY_BROKER_URL` DB0 broker

---

## Phase B — Payments & commerce

### B1. Stripe keys + webhook verification

| Field | Detail |
|-------|--------|
| Severity | **BLOCKER** |
| Problem | Empty/untested Stripe → pay without fulfill. |
| User scenario | Customer charged; order stays pending; download fails. |

#### Implementation steps

1. **Sandbox (this phase):** test keys only — see `docs/STRIPE_SANDBOX_CHECKLIST.md`. Prod live keys wait for Phase K.
2. Webhook endpoint: `POST /api/v1/payments/webhook/` (reuse existing view/service).
3. Subscribe to `STRIPE_WEBHOOK_EVENT_TYPES` in `payments/webhook_service.py`.
4. Set `STRIPE_WEBHOOK_SECRET`; restart web.
5. Full **test-mode** checkout → paid order, payment row, entitlement, receipt email.
6. Replay webhook → idempotent (`StripeWebhookEvent` unique).

#### Reuse

- `CheckoutService`, `webhook_service`, idempotent event store, legal gate — **do not fork** payment flow.

#### Status

- [x] Sandbox tooling + docs (2026-09-18) — checklist, `STRIPE_WEBHOOK_EVENT_TYPES`, checkout `accepted_legal`, `check_stripe_config` (+ `--require-test-mode` / `--ping`)
- [x] Operator verify (2026-09-19) — test keys configured; `check_stripe_config --require-test-mode --fail-on-warnings --ping --smoke-fulfill` OK (signed webhook fulfill + idempotent replay); browser test-card optional
- [ ] Production live keys — **not this phase** (Phase K)

---

### B2. Legal acceptance UX verification

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Backend legal gate exists; prod UX/docs versions must match. |
| User scenario | Disputes without clear accepted terms version. |

#### Implementation steps

1. Confirm `LEGAL_DOCUMENT_VERSIONS` / defaults.
2. Spot-check register + checkout + quotation pay require acceptance.
3. Ensure Terms/Privacy links resolve on public site.
4. No new legal subsystem — reuse Phase I `LegalAcceptance` APIs/UI.

#### Status

- [x] Done (sandbox) — `/terms` + `/privacy` pages (SEO), footer/register/contact/cart links; checkout + quotation pay send `accepted_legal`

---

## Phase C — Storage & downloads

### C1. Configure both R2 buckets

| Field | Detail |
|-------|--------|
| Severity | **BLOCKER** |
| Problem | Public + private R2 required for previews and paid packages. |
| User scenario | Broken thumbnails; paid download missing. |

#### Implementation steps

1. Create/configure both buckets; set all `R2_*` env vars from checklist.
2. Migrate local media if needed: `migrate_local_media_to_r2` (existing command).
3. Purchase test product → signed JSON download via existing `resolve_private_download` path.
4. Confirm `storage_path` never in API responses (existing contract).

#### Reuse

- `config/storages.py`, `config/media.py`, `downloads/services.py` — only configure env + migrate; do not reimplement signing.

#### Status

- [x] Tooling + docs (2026-09-18) — `verify_r2`, `docs/R2_STAGING_CHECKLIST.md`, checklist §2.5b, `.env.example` comments
- [x] Operator local (2026-09-19) — both buckets reachable; `verify_r2` → `public=ok private=ok`; `--smoke-presign` signed JSON (no `storage_path`) + GET + cleanup; `migrate_local_media_to_r2` ran; Compose wires `R2_SIGNED_URL_EXPIRY`
- [ ] Staging/prod host: copy same `R2_*` into root `.env` for Compose web+worker; re-run `verify_r2 --smoke-presign`
- [x] After sellable catalog: `audit_published_packages --fail-on-missing` clean (2026-09-19 — incomplete `tree` / `oak-chair` drafted by `seed_demo_catalog --unpublish-incomplete`)

---

### C2. Audit sellable SKUs have private packages

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Published items may lack private objects. |
| User scenario | Buyer pays; file 404. |

#### Implementation steps

1. Prefer extending existing admin/QA publish gates or management command style under `products/management/commands/`.
2. Script or admin report: every `published` product/plugin → private object exists.
3. Fix missing uploads before launch; do not auto-publish broken SKUs.

#### Reuse

- Product/plugin services, storage helpers, Feature 16 QA approve gates.

#### Status

- [x] Done (2026-09-18) — `audit_published_packages`; product approve + plugin publish require package object; tests

---

## Phase D — Auth & accounts

### D1. First Administrator + Google OAuth (if used)

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | No admin / mismatched Google client IDs. |
| User scenario | Cannot manage store; Google sign-in fails. |

#### Implementation steps

1. `createsuperuser` / ensure Administrator role (existing accounts model).
2. Set `GOOGLE_OAUTH_CLIENT_ID` + rebuild frontend with `VITE_GOOGLE_CLIENT_ID`.
3. Test: register → verify → login; admin login; Google; password reset.

#### Reuse

- Existing auth views, Google login, `AdminRoute`, cookie refresh client.

#### Status

- [x] Tooling + docs (2026-09-18) — `ensure_administrator`, `check_auth_config`, `docs/AUTH_STAGING_CHECKLIST.md`
- [x] Operator (local 2026-09-19): create/promote first Administrator + console login smoke  
- [x] Operator (local 2026-09-19): pair `GOOGLE_OAUTH_CLIENT_ID` ↔ `VITE_GOOGLE_CLIENT_ID`; GIS button renders (interactive Google account complete-login still optional)
- [ ] Operator (staging/prod): host admin + authorized origins + Compose Google vars / frontend rebuild  

---

### D2. Email verification links use public FRONTEND_BASE_URL

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Links may point at localhost if env wrong. |
| User scenario | Customer cannot verify → cannot buy. |

#### Implementation steps

1. Set `FRONTEND_BASE_URL=https://<public-origin>`.
2. Send one verification email; open on mobile + desktop.
3. Reuse existing verification task/token flow — only env fix unless bug found.

#### Status

- [x] Code guard + check command (2026-09-18) — refuse localhost FRONTEND when DEBUG=False (`ALLOW_LOCALHOST_FRONTEND`); links already use `config.mail.frontend_base_url`
- [x] Hardening (2026-09-19) — `check_auth_config` / deploy checks report `ALLOW_LOCALHOST_FRONTEND` and warn on non-HTTPS public FRONTEND when `DEBUG=False`; password-reset + verification outbox host tests
- [x] Local operator smoke (2026-09-19) — `FRONTEND_BASE_URL=http://localhost:5173`; verification link opened on desktop → `email_verified=True`; password-reset link host matches + SPA form loads
- [ ] Operator: staging/prod `FRONTEND_BASE_URL=https://…` + `ALLOW_LOCALHOST_FRONTEND=False` + one real inbox verification on phone + desktop (needs SMTP — A3) 

---

## Phase E — Search

### E1. Meilisearch healthy + full reindex

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Empty/unhealthy Meili with `MEILI_REQUIRED` → bad search/healthz. |
| User scenario | Search looks empty; site appears broken. |

#### Implementation steps

1. Confirm Meili health; strong master key; `MEILI_ENV=production`.
2. Run existing `reindex_search` management command.
3. `GET /api/v1/healthz/` → 200.
4. Public search for a known product name.

#### Reuse

- `search/indexer.py`, `search/client.py`, public list hydration in product/plugin views.

#### Status

- [x] Tooling + docs (2026-09-18) — `check_search_config` (reuses `probe_meilisearch` / healthz); existing `reindex_search`; checklist §2.2a
- [x] Local smoke (2026-09-18) — Meili healthy; `reindex_search` (2 products); healthz `meilisearch=ok`; public search hit for published product; indexer passes `primary_key=id` so fresh indexes retain documents

---

### E2. Async Meili sync via Celery (SHOULD)

| Field | Detail |
|-------|--------|
| Severity | **SHOULD** |
| Problem | In-request `sync_product()` latency + drift on failure. |
| User scenario | Batch publish; search misses new items. |

#### Implementation steps

1. Add Celery task wrapping existing `sync_product_by_id` (do not duplicate indexer logic).
2. Replace direct `sync_product(...)` calls in services with `enqueue_after_commit` of the task (same pattern as email tasks).
3. Keep sync path for tests / management command.
4. Log failures; rely on reindex for repair.
5. Tests: mock enqueue; indexer unit tests remain.

#### Reuse

- `search/indexer.py`, `enqueue_after_commit`, default Celery queue (`-Q celery,email` already consumes `celery`).

#### Status

- [x] Done (2026-09-18) — `search.tasks` wraps `sync_*_by_id`; product/plugin/download/review services `enqueue_after_commit`; indexer path kept for tests/`reindex_search`

---

## Phase F — Frontend launch hardening

### F1. Admin deep-link fix

Covered by **Phase A1** (same work item).

### F2. Expand Playwright E2E (SHOULD)

| Field | Detail |
|-------|--------|
| Severity | **SHOULD** |
| Problem | Single checkout Chromium journey. |
| User scenario | Admin/plugin regressions ship with green CI. |

#### Implementation steps

1. Extend `e2e/` using existing helpers (`e2e/helpers/auth.ts`), Compose overlay, seed command — do not create a parallel E2E stack.
2. Add specs:
   - Admin login + hard navigation to admin home (post-A1 path)
   - Plugin browse → add to cart / checkout smoke (reuse seed data patterns)
   - Optional: unverified user blocked from checkout
3. Keep CI e2e job structure in `.github/workflows/ci.yml`.

#### Status

- [x] Done (2026-09-18) — admin-console, plugin-checkout, unverified-login specs; seed admin/plugin/unverified; CI `E2E_*` env

| Field | Detail |
|-------|--------|
| Severity | **NICE** |
| Problem | Focus can escape modal; Product/Plugin CTA near-clones. |
| User scenario | Keyboard UX issues; inconsistent commerce bugs. |

#### Implementation steps

1. Focus trap inside existing `AuthModal` — small a11y fix only.
2. Extract shared commerce CTA primitive from `ProductCtaGroup` / `PluginCtaGroup`; thin wrappers keep props.
3. Optional shared browse filter shell for Models/Plugins pages — incremental, no visual redesign unless requested.
4. Introduce query-key helpers only where invalidation already duplicated — reuse TanStack Query patterns in `main.tsx`.

#### Status

- [x] Done (2026-09-18) — AuthModal Tab focus trap (`lib/focusTrap`); `CommerceCtaGroup` + thin Product/Plugin wrappers; browse shell / query-key helpers deferred

### G1. Shared parse/error helpers + default pagination (SHOULD)

| Field | Detail |
|-------|--------|
| Severity | **SHOULD** |
| Problem | Duplicated `_parse_uuid` / `_error_response`; easy to forget pagination. |
| User scenario | Inconsistent errors; huge unpaginated admin lists. |

#### Implementation steps

1. Create one shared module (e.g. `backend/config/api_helpers.py` or `accounts` common — **search first** for any existing helper).
2. Migrate apps **incrementally** (products, orders, payments first) — same behavior, no API contract change.
3. Set DRF `DEFAULT_PAGINATION_CLASS` to match existing `PageNumberPagination` (page_size 20, max 100) **or** document mandatory opt-in and add a checklist item for new views.
4. Keep `custom_exception_handler` as the primary error normalizer; align hand-rolled helpers with it.

#### Status

- [x] Done (2026-09-18) — `config.api_helpers` (`parse_uuid`, `parse_choice`, `domain_error_*`); `config.pagination.StandardPagination` + DRF `DEFAULT_PAGINATION_CLASS`; all marketplace app views migrated to shared helpers; paginators subclass shared defaults; `config.test_api_helpers`

---

### G2. Clean orphaned notifications leftovers (NICE)

| Field | Detail |
|-------|--------|
| Severity | **NICE** |
| Problem | Leftover `notifications` artifacts confuse ops. |

#### Implementation steps

1. Confirm not in `INSTALLED_APPS` and no runtime imports.
2. Remove dead files/pycache only; do not remove DB tables without a planned migration if any legacy rows remain (Feature 10 notes).
3. Prefer email-only alerts already implemented.

#### Status

- [x] Done (2026-09-18) — confirmed no `notifications` app / SPA inbox; email-only remains; `drop_legacy_notifications_table` for orphan DB tables; `DATABASE_STRUCTURE.md` updated

---

## Phase H — Security & monitoring

### H1. Sentry FE + BE

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | No visibility into production errors. |
| User scenario | Silent checkout failures. |

#### Implementation steps

1. Set `SENTRY_DSN`; rebuild frontend with `VITE_SENTRY_DSN` (Vite bake-at-build).
2. Verify test event; keep existing PII scrub in `frontend/src/lib/sentry.ts` and `backend/config/sentry.py`.
3. Do not add a second APM unless required.

#### Status

- [x] Tooling + docs (2026-09-18) — SDK already wired (`config.sentry` / `frontend/src/lib/sentry`); `check_sentry_config` (+ `--send-test-event`); `docs/SENTRY_STAGING_CHECKLIST.md`; checklist §2.2c; `.env.example` comments
- [ ] Operator: set `SENTRY_DSN` + rebuild frontend with `VITE_SENTRY_DSN`; confirm test events in both projects

---

### H2. Formal security smoke on host

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Sprint 11 security/production sign-off still Open. |
| User scenario | Launch with unknown authz/payment holes. |

#### Implementation steps (checklist — reuse Security_Checklist.md)

1. `check --deploy` clean; DEBUG false; HTTPS; Secure cookies.  
2. Login brute force → throttle.  
3. Unauthenticated download → 401/403.  
4. Unsigned private object URL → denied.  
5. Bad webhook signature → 400, no fulfill.  
6. CORS/CSRF only allowlisted origins.  
7. Django admin locked down or disabled if unused.  
8. Record date/initials in `PRODUCTION_CHECKLIST.md` sign-off table.

#### Status

- [x] Tooling + docs (2026-09-18) — `docs/SECURITY_SMOKE_CHECKLIST.md`; linked from PRODUCTION_CHECKLIST §0/§5
- [x] Operator local smoke (2026-09-19) — `manage.py check_security_smoke` (`config.security_smoke`); all 7 checks OK with `DEBUG=True` advisory; tests in `config.test_security_smoke`; PRODUCTION_CHECKLIST §0/§5 + SECURITY_SMOKE sign-off table updated
- [ ] Operator: re-run on staging/prod with `DEBUG=False` + HTTPS + `--fail-on-warnings` and record date/initials

---

### H3. Cloudflare WAF / bot protection (SHOULD)

| Field | Detail |
|-------|--------|
| Severity | **SHOULD** |
| Problem | App throttles alone may not stop bots. |
| User scenario | Register/login flood; real users locked out. |

#### Implementation steps

1. Enable Cloudflare WAF / bot fight in front of Nginx.
2. Keep DRF throttles as second layer — do not remove them.

#### Status

- [x] Docs (2026-09-18) — `docs/CLOUDFLARE_WAF_CHECKLIST.md`
- [x] App-layer readiness (2026-09-19) — expanded runbook; `manage.py check_waf_readiness` (`config.waf_readiness`); Nginx `CF-Connecting-IP` → client IP for DRF throttles; DRF auth throttles verified still enabled; local sign-off in checklist
- [ ] Operator: enable proxied DNS + WAF/Bot Fight (+ webhook skip) on Cloudflare staging/prod and sign off

---

## Phase I — Data & catalog readiness

### I1. Seed sellable catalog

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | Empty/draft catalog → zero conversions. |
| User scenario | Launch with nothing to buy. |

#### Implementation steps

1. Publish N products + plugins with images, preview GLB, private package, price, category.
2. Use existing admin UI / Feature 16 import → QA approve — do not build a new importer.
3. Reindex search after publish.

#### Status

- [x] Tooling + docs (2026-09-18) — `seed_demo_catalog`; `docs/CATALOG_OPS_STAGING_CHECKLIST.md` §I1
- [x] Operator local smoke (2026-09-19) — `seed_demo_catalog` (images + packages; unpublish incomplete), `audit_published_packages --fail-on-missing` clean, `reindex_search`, browse/search hits, paid download 200; replace demo SKUs before public launch

---

### I2. Staff, coupons, support routing

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | No operators / contact nowhere. |
| User scenario | Contact form silent; reviews unmoderated. |

#### Implementation steps

1. Staff Administrator accounts; contact recipients env.  
2. Confirm contact + project message emails.  
3. Define refund process matching existing Stripe refund webhook behavior (do not invent parallel refund code).  
4. Optional launch coupon via existing coupons admin.

#### Status

- [x] Tooling + docs (2026-09-18) — `check_ops_config`; refund process documented in CATALOG_OPS §I2 (reuse Stripe `charge.refunded`)
- [x] Operator local smoke (2026-09-19) — Administrator `admin@marketplace.local`; `CONTACT_ADMIN_RECIPIENTS` + `PROJECT_MESSAGE_ADMIN_RECIPIENTS` set; `check_ops_config --fail-on-warnings` OK; contact + quotation-accepted console mail; refund runbook expanded; optional `LAUNCH10` coupon; staging/prod real inboxes still open

---

### I3. Batch intake Excel sign-off (SHOULD / ops)

| Field | Detail |
|-------|--------|
| Severity | **SHOULD** (if Feature 16 used day-1) |
| Problem | Live column contract not signed off. |

#### Implementation steps

1. Freeze columns per `docs/batch-ingest-contract.md`.  
2. Dry-run import on staging → QA → publish.  
3. Desktop bridge `.exe` polish is **out of marketplace repo** — track separately.

#### Status

- [x] Docs (2026-09-18) — CATALOG_OPS §I3 points at `batch-ingest-contract.md` + fixtures
- [x] Column freeze (2026-09-19) — intake `Thumbnail Path` / `Gallery Image Paths` / `Tags` + sheet `Intake` locked; sign-off in contract
- [x] Local operator smoke (2026-09-19) — `manage.py check_batch_ingest` (+ `--apply` happy → QA approve → publish → reindex advisory); gate-failure fixtures rejected
- [ ] Staging/prod host: re-run `check_batch_ingest --apply` when Feature 16 is day-1

---

## Phase J — Performance (SHOULD / NICE)

### J1. Smoke load on critical paths (SHOULD)

| Field | Detail |
|-------|--------|
| Severity | **SHOULD** |
| Problem | No formal load sign-off. |
| User scenario | Viral traffic → 503 on detail/checkout. |

#### Implementation steps

1. Manual or light load: home, product detail, search, checkout session create.  
2. Fix only proven N+1 / timeout issues using existing query patterns (select_related/prefetch already used in places — extend, don’t rewrite).  
3. Ensure public assets via `R2_PUBLIC_BASE_URL` / Cloudflare CDN.

#### Status

- [x] Docs (2026-09-18) — `docs/LOAD_SMOKE_CHECKLIST.md`
- [x] Tooling + local operator (2026-09-19) — `config.load_smoke` + `manage.py check_load_smoke` (--iterations soak, query budgets, public CDN wiring); `seed_demo_catalog` writes R2 public thumbnails/previews when `R2_ENABLED`; local `--iterations 20` OK; tests `config.test_load_smoke`
- [ ] Operator: re-run on staging/prod with `--fail-on-warnings` and sign off

---

### J2. Viewer GPU tuning (NICE)

| Field | Detail |
|-------|--------|
| Severity | **NICE** |
| Problem | High shadow maps may hurt low-end GPUs. |

#### Implementation steps

1. Adjust only inside `components/viewer/*` using existing adaptive DPR / visibility hooks.  
2. Keep URL safety and dispose behavior intact.  
3. Fullscreen mode remains deferred polish per status.

#### Status

- [x] Done (2026-09-18) — adaptive shadow maps (1024 mobile / 2048 desktop) via `getAdaptiveShadowMapSize`; DPR caps unchanged; fullscreen still deferred

---

## Phase K — Production cutover

### K1. Execute full PRODUCTION_CHECKLIST on staging then prod

| Field | Detail |
|-------|--------|
| Severity | **BLOCKER** (process) |
| Steps | Follow `docs/PRODUCTION_CHECKLIST.md` §§1–4 exactly: env → build/tag images → up → check --deploy → healthz → mail → webhook → backup → soft launch → watch Sentry 24h. |

#### Status

- [x] Tooling + docs (2026-09-19) — `config.cutover_gate` + `manage.py check_cutover` (`--profile local|staging|production`); Compose `WEB_IMAGE`/`FRONTEND_IMAGE`; `backend/scripts/build_immutable_images.sh` + `.ps1`; `docs/CUTOVER_STAGING_CHECKLIST.md`; PRODUCTION_CHECKLIST §0/§3/§4 links; Stripe `require_live_mode` for prod profile; local `check_cutover --profile local` OK; tests `config.test_cutover_gate`
- [ ] Staging complete (operator: fill host `.env`, immutable up, `check_cutover --profile staging --fail-on-warnings`, soft-launch test Stripe — see CUTOVER §5)
- [ ] Production complete (operator: live keys + DNS + `check_cutover --profile production` + 24h Sentry)

---

### K2. Rollback rehearsal

| Field | Detail |
|-------|--------|
| Severity | **MUST** |
| Problem | No practiced rollback. |
| User scenario | Bad Friday deploy breaks checkout. |

#### Implementation steps

1. Deploy with immutable image tags (not only `:latest`).  
2. Rehearse rollback to previous web/frontend tags without unsafe migrate reverse (expand/contract policy in checklist).  
3. Confirm webhook idempotency on Stripe retries after rollback.

#### Status

- [x] Docs (2026-09-18) — `docs/ROLLBACK_REHEARSAL.md` + PRODUCTION_CHECKLIST §4/§5 links
- [x] Tooling + local smoke (2026-09-19) — `config.rollback_rehearsal` + `manage.py check_rollback_rehearsal`; `rollback_compose.sh` + `.ps1` (`--no-deps --force-recreate` web/worker/frontend); expanded runbook (migration/secrets policy, webhook idempotency, dated sign-off); PRODUCTION_CHECKLIST / CUTOVER links; tests `config.test_rollback_rehearsal`; local gate OK
- [ ] Operator: rehearse on staging with immutable tags A→B→A (date ROLLBACK_REHEARSAL §4)

---

## Phase L — Architecture score-up (no behavior change on happy paths)

Additive hardening from the 2026-09-19 architect review. Does **not** rewrite products/plugins, Stripe, JWT, or R2.

| ID | Item | Status |
|----|------|--------|
| L1 | Gate OpenAPI/Swagger when `DEBUG=False` (admin JWT) | [x] 2026-09-19 |
| L2 | Optional `REDIS_PASSWORD` (Compose requirepass + URL inject; empty = current local) | [x] 2026-09-19 |
| L3 | `DJANGO_ADMIN_ENABLED` / `DJANGO_ADMIN_ALLOWED_IPS` (default on; `/api/v1/admin/` untouched) | [x] 2026-09-19 |
| L4 | Worker skips migrate/collectstatic (`SKIP_STARTUP_MIGRATE` + celery argv) | [x] 2026-09-19 |
| L5 | Public catalog `Cache-Control` on product/plugin/category GET 200 | [x] 2026-09-19 |
| L6 | `check_catalog_integrity` read-only orphan report | [x] 2026-09-19 |

---

## Master tracking table

| ID | Item | Severity | Phase | Status |
|----|------|----------|-------|--------|
| A1 | SPA vs Django admin routing | BLOCKER | A | [x] |
| A2 | Prod secrets / hosts / TLS | BLOCKER | A | [x] tooling/docs + Compose CSRF/HSTS + checker flags (2026-09-19) / [ ] operator live host |
| A3 | SMTP (+ optional console guard) | BLOCKER | A | [x] tooling/docs+guard / [ ] SMTP operator (**deferred 2026-09-19** — keep open) |
| A4 | Worker healthcheck | MUST | A | [x] |
| A5 | Backup + restore drill | MUST | A | [x] tooling+local drill / [ ] staging host |
| A6 | Redis DB split | SHOULD | A | [x] |
| B1 | Stripe + webhook | BLOCKER | B | [x] sandbox docs/code+check_stripe_config+smoke-fulfill / [ ] live = Phase K |
| B2 | Legal acceptance verify | MUST | B | [x] |
| C1 | R2 both buckets | BLOCKER | C | [x] local verify+smoke+migrate (2026-09-19) / [ ] staging Compose root `.env` + catalog audit clean |
| C2 | Package audit for published SKUs | MUST | C | [x] |
| D1 | Admin user + Google OAuth | MUST | D | [x] local operator 2026-09-19 / [ ] staging host |
| D2 | FRONTEND_BASE_URL verify links | MUST | D | [x] guard+check+local smoke (2026-09-19) / [ ] staging HTTPS inbox + mobile |
| E1 | Meili + reindex | MUST | E | [x] |
| E2 | Async Meili sync | SHOULD | E | [x] |
| F2 | Broader Playwright E2E | SHOULD | F | [x] |
| F3 | Focus trap + CTA dedupe | NICE | F | [x] |
| G1 | Shared API helpers / pagination | SHOULD | G | [x] |
| G2 | Notifications cleanup | NICE | G | [x] |
| H1 | Sentry FE/BE | MUST | H | [x] tooling/docs / [ ] operator DSNs |
| H2 | Security smoke sign-off | MUST | H | [x] docs+check_security_smoke+local (2026-09-19) / [ ] staging/prod host |
| H3 | Cloudflare WAF | SHOULD | H | [x] docs + readiness + Nginx CF IP (2026-09-19) / [ ] CF dashboard operator |
| I1 | Sellable catalog seeded | MUST | I | [x] tooling/docs / [x] local operator (demo; replace before public launch) |
| I2 | Staff / support / coupons | MUST | I | [x] tooling/docs / [ ] operator |
| I3 | Batch Excel sign-off | SHOULD | I | [x] docs+freeze+check_batch_ingest local (2026-09-19) / [ ] staging host |
| J1 | Load smoke | SHOULD | J | [x] docs+check_load_smoke+local (2026-09-19) / [ ] staging host |
| J2 | Viewer GPU polish | NICE | J | [x] |
| K1 | Full checklist staging+prod | BLOCKER | K | [x] tooling/docs+local gate (2026-09-19) / [ ] staging host / [ ] prod host |
| K2 | Rollback rehearsal | MUST | K | [x] docs+tooling+local (2026-09-19) / [ ] staging host |
| L1–L6 | Score-up hardening | SHOULD | L | [x] 2026-09-19 (OpenAPI gate, Redis AUTH optional, Django admin lock, worker skip-migrate, catalog cache headers, integrity command) |

---

## Non-goals (explicitly out of this plan)

- UI redesign / brand refresh pending manager prototype  
- PayPal / Razorpay (unless product later re-scopes Feature 15)  
- Fullscreen 3D viewer polish  
- Microservices split  
- Rewriting working Stripe / JWT / R2 / Celery mail stacks  
- Desktop catalog-bridge `.exe` polish (separate repo)

---

## Close — reuse & stability clause (mandatory)

**Every implementer of any item in this document must:**

1. **Search first, reuse always** — extend existing services, hooks, components, storages, auth, payment, download, and search code before adding parallel systems.  
2. **Improve by composition** — shared helpers and thin wrappers beat copy-paste and greenfield rewrites.  
3. **Never break what already works** — preserve API contracts, security gates, idempotency, entitlement downloads, and passing tests; prefer additive redirects and feature flags over silent breaking changes.  
4. **Touch only what the phase requires** — no unrelated refactors, dependency churn, or architecture rewrites unless a phase explicitly calls for them.  
5. **Prove the fix** — automated tests for code changes; checklist smoke for operator/env changes; update this file’s status checkboxes when done.

If a fix appears to require rewriting a working subsystem, **stop**, re-read `.cursor/rules.md`, and prefer the smallest extension that reuses the current implementation.

---

## Suggested first sprint (code + staging)

1. **A1** — Admin path collision (code) ✅  
2. **A3** tooling + code guard ✅ — operator SMTP **deferred** (resume later: `docs/SMTP_STAGING_CHECKLIST.md`)  
3. **C1** local R2 verify + smoke + migrate ✅ — staging Compose root `.env` + catalog audit still open; **B1** Stripe test webhook ✅  
4. **E1** Meili reindex + search smoke ✅ + **E2** async sync ✅; **H1** Sentry tooling ✅ (operator: set DSNs on staging)  
5. **K1** staging checklist pass → then prod cutover (A3 SMTP must be closed before real verification/checkout mail) — tooling ready (`check_cutover` + immutable tags); operator host sign-off still open

---

*Generated from the launch-readiness / architecture review. Keep this file updated as phases complete.*
