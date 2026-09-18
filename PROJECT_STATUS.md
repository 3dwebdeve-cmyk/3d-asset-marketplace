PROJECT STATUS
Project Information
Project Name: 3D Asset Marketplace
Version: 1.0
Current Phase: Phase 1 – Marketplace Development
Project Type: International Digital Marketplace for 3D Models, Plugins, and Custom 3D Design Services
Project Progress
Overall Completion: ~85%
Current Development Sprint
Current Sprint: Phase 1 — Production readiness
Sprint Goal: Feature 13 Docker + Sprint 11 formal QA / security / deployment (performance code pass done 2026-09-16)
Sprint Status: Feature 13 Docker + browser E2E + production checklist runbook landed 2026-09-17; live host security/deploy sign-off still open (operator executes docs/PRODUCTION_CHECKLIST.md)
Development Roadmap
Sprint 1 – Project Setup
• [x] Create Git Repository
• [x] Configure Cursor IDE
• [x] Create Django Project
• [x] Create React Project
• [x] Configure PostgreSQL
• [x] Configure Docker (Feature 13 — backend Dockerfile/Gunicorn, frontend Nginx, Compose: web/worker/postgres/redis/meilisearch)
• [x] Configure GitHub Repository
• [x] Connect Frontend & Backend
• [x] Initial Project Commit
Sprint 2 – Authentication
• [x] JWT Authentication
• [x] User Registration
• [x] User Login
• [x] Email Verification (re-enabled 2026-09-17 — register unverified + Celery link; login gated)
• [x] Password Reset
• [x] User Roles (Administrator login + RBAC gate)
• [x] Protected Routes
Sprint 3 – Marketplace
• [x] Categories
• [x] Product CRUD
• [x] Product Images
• [x] Product Files
• [x] Product Details Page
• [x] Product Search
• [x] Product Filters
• [x] Pagination
Sprint 4 – 3D Viewer
• [x] React Three Fiber Setup (lazy ModelViewer)
• [x] GLB Preview (preview_model only; never private packages)
• [x] Orbit Controls (basic limits)
• [x] Lighting (studio defaults)
• [x] WebGL unavailable fallback
• [x] GPU resource disposal on unmount
• [x] Mobile pixel-ratio cap + off-screen render pause
• [ ] Fullscreen Mode (deferred polish)
• [x] Responsive Viewer (adaptive DPR + viewport visibility)
Sprint 5 – Plugin Store
• [x] Plugin Categories (backend APIs)
• [x] Plugin Listing (backend API)
• [x] Plugin Details (backend API)
• [x] Plugin Downloads (authenticated; purchase-gated; R2 signed JSON when private object exists)
• [x] Plugin Search (backend API)
• [x] Public Plugin Browse Page (/plugins) — Feature 3A complete
  - Public TypeScript types (PublicPlugin, PublicPluginDetail, etc.)
  - listPublicPlugins / getPublicPlugin / listPublicPluginCategories API functions
  - PluginCard component (reuses products-browse CSS design system)
  - PluginsBrowsePage: search, category filter, sort, pagination, loading/empty/error states
  - /plugins + /Plugins routes in App.tsx
  - "Plugins" link added to Navbar
  - 7/7 unit tests passing
• [x] Plugin Detail Page (/plugins/:slug) — Feature 3B complete (2026-07-29)
  - PluginDetailsPage.tsx: hero, breadcrumb, gallery, description, compatible software, documentation link, related plugins
  - PluginCtaGroup.tsx: auth-aware CTAs (wishlist live; cart disabled coming soon for signed-in; sign-in links for guests); plugin-specific share URL
  - PluginSpecs.tsx: version, compatible software, file format(s), file size, last updated specs table
  - Reuses ProductImageGallery component (no 3D model — plugins have no preview_model)
  - /plugins/:slug + /Plugins/:slug routes wired in App.tsx (lazy-loaded)
  - No storage_path or package download URL exposed on public page
  - documentation_url rendered as plain <a> with rel="noopener noreferrer" (no dangerouslySetInnerHTML)
  - all text fields rendered as plain text nodes (XSS-safe)
  - SEO: document title and meta description set from plugin name + short_description
  - Loading skeleton, error state with retry, 404 not-found state
  - Related plugins from same category (excludes current plugin, up to 4)
  - 15/15 unit tests passing
Sprint 6 – Shopping & Payments
• [x] Shopping Cart (Feature 6)
• [x] Coupons / Discount codes (admin CRUD + cart apply)
• [x] Checkout (cart → pending order → Stripe Checkout Session)
• [x] Stripe Integration (Phase 1 — Checkout Sessions + webhook fulfillment)
• [x] Invoice Generation (on-the-fly PDF via reportlab; customer + admin download; receipt email attachment)
• [x] Payment Verification (Stripe webhook signature + idempotent event store)
Sprint 7 – Orders & Downloads
• [x] Orders (Phase 15A — data model + service layer)
• [x] Orders admin APIs (Phase 15B — admin list/detail + optional create)
• [x] Orders admin UI (Feature 21 — list/detail/create SPA)
• [x] Order History (customer list/detail at /dashboard/orders)
• [x] Order integrity hardening (Feature 8 — title/slug snapshots + admin status transitions)
• [x] Secure Downloads (authenticated; order+payment must be paid)
• [x] Signed Download URLs (Feature 14B — R2 presigned GET after entitlement; local FileResponse fallback)
• [x] Download History (download_history table; customer + admin audit UI)
Sprint 8 – Custom Project Portal
• [x] Request Custom Project (customer API create/list/detail + reference upload)
• [x] Upload Reference Files (customer UI on project detail + request flow)
• [x] Admin Review (admin list/detail/status/assign/notes)
• [x] Project Quotation (admin upsert quotation API + UI)
• [x] Project Messages (backend APIs + customer/admin detail thread UI)
• [x] Project Message Unread Indicators (read cursor, mark-read, list badges)
• [x] Project Message Attachments (multipart upload, owner/admin download, thread UI)
• [x] Project Message Email Notifications (customer↔staff alerts via Django mail)
• [x] Client Approval (accept quotation API + customer detail UI)
• [x] Project Status Tracking (customer-facing detail)
• [x] Deliverables Upload (admin multipart API; storage_path hidden)
• [x] Project Delivery data model (ProjectDelivery table + Django admin; separate from reference ProjectFile)
• [x] Project Delivery list/download APIs (admin + owner; authenticated FileResponse; storage_path hidden)
• [x] Admin delivery UI (upload + list/download + mark delivered/completed on /admin/projects/:id)
• [x] Project Completion (Feature 4)
• [x] Quotation payment (Feature 15G — Stripe Checkout for accepted quotes)
Sprint 9 – Dashboards
Customer Dashboard
• [x] Profile
• [x] Orders (My Orders list/detail at /dashboard/orders)
• [x] Downloads (My Downloads library + history at /dashboard/downloads)
• [x] Wishlist
• [x] Reviews & Ratings (purchase-gated; admin hide/delete; aggregates on cards/detail)
• [x] Automated email alerts (quotation/offer, messages, delivery, receipts — Celery; no in-app inbox)
• [x] Remove leftover in-app notification UI/API (Feature 10 — confirmed absent; email-only)
• [x] My Projects
Admin Dashboard
• [x] Dashboard Overview (shell + administrator session gate)
• [x] Admin layout & navigation (sidebar, header, mobile menu, session shell)
• [x] Admin home dashboard with real stats (users, products, categories, plugins, custom projects; monthly sales from paid orders)
• [x] Dedicated /admin/login + customer/admin login separation
• [x] Users (admin user CRUD)
• [x] Product Management
• [x] Plugin Management
• [x] Custom Projects
• [x] Orders (admin list/detail/create UI; allowed status transition controls)
• [x] Coupons (list/create/detail; percent or fixed; expiry + usage limits)
• [x] Reviews moderation (list / hide / delete)
• [x] Download History audit (/admin/downloads)
• [x] Payments (admin payments list/detail — Feature 15F)
• [x] Analytics (Feature 11 — order-based revenue, top products/plugins, date filters)
• [x] Batch import review / QA queue (Feature 16 Phase 7)
Public Site Pages
• [x] About page (/about) — studio mission, offerings, trust, CTAs
• [x] Contact form (/contact) — POST /api/contact/ emails admin; honeypot + rate limit
• [x] Custom Projects landing (/custom-projects) — marketing page linking to request flow
• [x] Site footer + navbar discovery links; login honors state.from redirect
Sprint 10 – Cloud Storage & Batch Ingest (complete in marketplace repo — see IMPLEMENTATION_ROADMAP.md)
• [x] Feature 14 — Cloudflare R2 storage foundation (public + private buckets; django-storages)
• [x] Feature 14B — Signed R2 download URLs (entitlement → short-lived presigned GET JSON) 
• [x] Feature 16 Phase 3 — Product SKU / Model_ID identity
• [x] Feature 16 Phase 4 — Freeze Batch Output Report + Phase 1 intake contracts
• [x] Feature 16 Phase 5 — R2 Bridge CLI uploader (local R2 ingest done; desktop .exe polish separate)
• [x] Feature 16 Phase 6 — Catalog import API/job (create pending_review products)
• [x] Feature 16 Phase 7 — Admin import review UI
• [x] Feature 16 Phase 8 — QA approve / reject → publish workflow (backend API)
• [x] Feature 16 Phase 9 — E2E: import → QA → Stripe → entitled download (API test)
• [x] Feature 16 Phase 10 — Hardening (R2 retries, batch public media, leftover media → R2 command)
Sprint 11 – Testing & Deployment
• [ ] API Testing (formal coverage / sign-off — unit/API suites already extensive)
• [x] UI Testing (browser E2E Playwright — product checkout + admin console + plugin checkout + unverified login gate; CI Compose job)
• [ ] Security Testing
• [x] Performance Optimization (Sprint 11 pass 2026-09-16 — query/cache/viewer; formal load/E2E still open)
• [ ] Deployment
• [ ] Production Testing
Current Task
Today's Goal:
Launch readiness Phase A5 tooling/docs complete (backup retention + disposable restore drill). Operator: run docs/BACKUP_RESTORE_DRILL.md on staging (dump, restore, cron, R2 lifecycle).
Current Git Branch
feature/2026-09-17
Files Being Worked On
• backend/scripts/backup_postgres.sh, restore_postgres_drill.sh, upload_backup_to_r2.py
• docs/BACKUP_RESTORE_DRILL.md, docs/PRODUCTION_CHECKLIST.md §2.6
• PROJECT_STATUS.md, implementingFIXfeature.md
Completed Features
• Launch readiness Phase A5 — backup + restore drill tooling/docs (2026-09-18)
  - BACKUP_RETENTION_DAYS prune on backup_postgres.sh; disposable restore_postgres_drill.sh (never touches postgres_data)
  - docs/BACKUP_RESTORE_DRILL.md (cron, retention, R2≠DB); PRODUCTION_CHECKLIST §2.6; .env.example comments
  - Live staging/prod dump + cron install remains operator gate
• Backend 10/10 Phase J — ops backup script + cleanup + checklist link (2026-09-18)
  - backup_postgres.sh (pg_dump -Fc) + optional R2 private upload (same R2_* / boto3)
  - PRODUCTION_CHECKLIST §2.6 linked; Feature 10 remnants confirmed absent
  - Engineering 10/10 target met; live staging drill remains operator gate
• Backend 10/10 Phase I — LegalAcceptance + OpenAPI (2026-09-18)
  - LegalAcceptance model; LEGAL_DOCUMENT_VERSIONS; register + checkout gates
  - GET legal-documents / POST legal-acceptances; frontend register sends accepted_legal
  - drf-spectacular schema at /api/v1/schema/; CI schema generation
• Backend 10/10 Phase H — Idempotency + Celery email queue + throttle verify (2026-09-18)
  - Idempotency-Key on cart checkout + quotation pay (Django cache, 24h, 2xx only)
  - Mail tasks queue="email"; worker `-Q celery,email`; CELERY_TASK_ROUTES
  - Verified throttles: quotation resend, catalog import, message create (no new scopes)
• Backend 10/10 Phase G — Meili prod policy + legacy /api/ removal (2026-09-18)
  - MEILI_REQUIRED (default not DEBUG); healthz + public search 503 when required+down
  - LegacyApiPathAliasMiddleware removed; refresh cookie Path=/api/v1/auth/
• Backend 10/10 Phase F — access-token revocation via token_version (2026-09-18)
  - User.token_version bumped on password change/reset; JWT `tv` claim
  - VersionedJWTAuthentication + refresh cookie tv check; stale access → 401
• Backend 10/10 Phase E — service facades (2026-09-18)
  - Custom projects split into domain mixins + CustomProjectService facade
  - Payments split into admin/checkout/webhook + services.py re-exports
  - Views/URLs unchanged; custom_projects + payments tests 152 OK
• Backend 10/10 Phase D — custom-project private download / R2 parity (2026-09-18)
  - Downloads already via resolve_private_download; migration copies files/messages/deliveries
  - Signed-JSON tests for reference files, message attachments, deliveries (+ stream fallback)
• Backend 10/10 Phase C — durable ActivityLog (2026-09-18)
  - ActivityLog model + migration 0004; log_admin_action persists fail-soft + logger
  - GET /api/v1/admin/activity-logs/ (Administrator; filters action/actor_id/target_id)
  - Read-only Django admin; tests for archive → row, list ACL, fail-soft
• Backend 10/10 Phase B — Stripe charge.refunded webhook (2026-09-18)
  - WebhookService._handle_charge_refunded (full refund only; partial ignored)
  - OrderService.mark_refunded → order+payment refunded; custom-project revert
  - CustomProjectService.revert_quotation_after_refund (unpaid; in_progress→approved; keep deliveries/quote)
  - Entitlement revoked via existing paid+paid gates (no download code change)
  - Tests: catalog refund + entitlement, duplicate/partial/unknown PI, quotation refund
• Launch readiness Phase B1 — Stripe sandbox verify tooling (2026-09-18)
  - `check_stripe_config` (+ `--require-test-mode` / `--fail-on-warnings` / `--ping`); no secrets printed
  - `docs/STRIPE_SANDBOX_CHECKLIST.md` + PRODUCTION_CHECKLIST §2.5; operator still runs real test checkout
• Backend 10/10 Phase A — shared mail kernel + OutboundEmailLog + quotation resend (2026-09-18)
  - config/mail.py: frontend_base_url, safe_email_text, render_text_email, send_text_mail
  - mail_log app: OutboundEmailLog (hashed recipients only) + MailLogService + read-only Django admin
  - Wired custom_projects / orders / accounts / contact deliver paths (fail-soft log writes)
  - POST /api/v1/admin/custom-projects/<id>/quotation/resend-email/ (no quotation mutation)
  - Tests: mail_log + workflow resend/log; existing fail-soft mail tests updated to patch config.mail.send_mail
• Product decision: email-only alerts (2026-09-18)
  - In-app notification inbox is out of Phase 1 (no bell, no /dashboard/notifications)
  - Customers and staff are notified by automated Celery email (quotation/offer, project messages, delivery, receipts, auth)
  - Feature 10 inbox code confirmed absent (Phase J cleanup)
• Email verification re-enabled (2026-09-17)
  - Register unverified + Celery verification email; login 403 email_not_verified
  - IsEmailVerified on checkout + custom-project create/accept/pay
  - Password change requires verified email + Celery security notice
  - Google OAuth still trusts Google email_verified; admin create stays verified
• Browser E2E Playwright (2026-09-17)
  - Playwright suite: login → product viewer → add to cart → checkout → success confirm → download
  - E2E_STRIPE_SIMULATE (Compose/CI only; refuses sk_live_); seed_e2e_commerce fixture command
  - CI e2e job builds Compose overlay, seeds fixtures, runs Chromium; never logs real Stripe secrets
• Launch readiness Phase F — frontend hardening (2026-09-18)
  - Playwright: admin `/console` login + hard nav; plugin cart/checkout smoke; unverified login gate
  - seed_e2e_commerce also seeds admin, published plugin package, unverified buyer
  - AuthModal Tab focus trap; shared CommerceCtaGroup with thin Product/Plugin wrappers
• Launch readiness G1 + H1 (2026-09-18)
  - Shared `config.api_helpers` + `StandardPagination` / DRF DEFAULT_PAGINATION_CLASS; products/orders/payments migrated
  - Sentry: `check_sentry_config` (+ `--send-test-event`), `docs/SENTRY_STAGING_CHECKLIST.md`, checklist §2.2c (operator sets DSNs)
• Launch readiness remaining code/docs (2026-09-18)
  - G2: `drop_legacy_notifications_table`; G1 helpers across remaining apps; J2 adaptive shadow maps
  - H2/H3/I1–I3/J1/K2 staging checklists + `seed_demo_catalog` + `check_ops_config` (operator host work still open)
• Launch readiness Phase A2 — prod secrets / hosts / TLS (2026-09-18)
  - `check_deploy_config` (+ `--fail-on-warnings` / `--django-deploy-check`); deploy checks `config.E001`/`E002`/`W001`
  - `docs/DEPLOY_SECRETS_STAGING_CHECKLIST.md`; PRODUCTION_CHECKLIST §1/§2.1; `.env.example` comments (operator sets live secrets/TLS)
• Launch readiness Phase A3 — SMTP + refuse console in production (2026-09-18)
  - Boot guard: `ALLOW_CONSOLE_EMAIL` + `ImproperlyConfigured` when `DEBUG=False` and console backend
  - `check_email_config` (+ `--fail-on-warnings` / `--send-test-email`); `docs/SMTP_STAGING_CHECKLIST.md`; checklist §1/§2.4
  - Compose web+worker `EMAIL_*` parity; console still allowed for local DEBUG / `ALLOW_CONSOLE_EMAIL=True` (operator sets real SMTP)
• API versioning /api/v1 (2026-09-17)
  - Canonical mount at /api/v1/; unversioned /api/ rewritten to v1 via LegacyApiPathAliasMiddleware (one-release alias)
  - reverse() and download_url builders emit /api/v1/; auth/entitlement rules unchanged
  - Refresh cookie Path=/api/ so both /api/auth/ and /api/v1/auth/ receive it; logout clears legacy paths
  - Frontend API modules + Axios refresh use /api/v1/; Compose healthcheck uses /api/v1/healthz/
• JWT refresh httpOnly cookie (2026-09-17)
  - Access token memory-only; refresh never returned in JSON or stored in localStorage
  - Login/Google/admin Set-Cookie; CookieTokenRefreshView rotates + blacklists; logout clears cookie
  - remember_me controls cookie Max-Age (7 days) vs session cookie; Vite `/api` proxy for SameSite=Lax
  - SPA Nginx CSP as XSS defense-in-depth; CORS_ALLOW_CREDENTIALS=True; server RBAC unchanged
• Sentry production monitoring (2026-09-17)
  - Django + Celery SDK init gated by SENTRY_DSN; React SDK gated by VITE_SENTRY_DSN
  - before_send / EventScrubber redacts tokens, passwords, cookies, emails
  - Stripe webhook failures tagged area=payments_webhook for alerting
  - Frontend logger + ErrorBoundary forward to Sentry; React 19 createRoot error hooks
• Email verification re-enabled (2026-09-17)
  - Register creates email_verified=False and enqueues Celery verification email
  - Customer login returns 403 email_not_verified until confirmed; Google OAuth still trusts Google email_verified
  - IsEmailVerified gates checkout + custom-project create/accept/pay
  - Password change requires verified email and enqueues a security notification email
  - SPA /verify-email routes restored; admin create still marks verified
• Email verification disabled (2026-09-17) — superseded by re-enable above
  - Register/admin-create set email_verified=True; no verification emails
  - Customer login no longer requires verification (legacy unverified users can sign in)
  - SPA verify-email routes redirect to login; register success prompts sign-in
  - Confirm/resend APIs kept as harmless compatibility endpoints; admin email_verified field retained
• Celery async email (2026-09-17)
  - Celery app + Redis broker (REDIS_URL); eager mode when no Redis / under tests
  - Receipt, project, contact, password-reset, verification, and password-changed emails moved to retried tasks
  - Stripe webhook fulfillment remains in-process + idempotent; receipt enqueued after DB commit
  - Compose `worker` service; webhook signature verification unchanged
• Feature 13 — Docker & local/prod runtime (2026-09-17)
  - Backend Python 3.12 image → Gunicorn; entrypoint waits for Postgres/Meili, migrate, collectstatic
  - Frontend multi-stage Vite build → Nginx SPA; /api + /admin + /static proxied to web; Cloudflare Pages `_redirects`
  - Compose: web, frontend, worker, postgres, redis, meilisearch
  - Healthcheck wired to existing GET /api/healthz/; DEBUG=False baked into web image; secrets via env / root `.env`
  - WhiteNoise for Django static; settings load from OS env when backend/.env is absent
• Sprint 11 performance / security hardening pass (2026-09-16)
  - Frontend: QueryClient defaults (staleTime/gcTime/retry); shared cart + category query keys; keepPreviousData on Models/Plugins browse; ModelViewer ground texture dispose + 1024 shadow maps
  - Backend: public product/plugin list `.defer()`; batched order-detail downloadable files (N+1 fix); download history Max annotate; DB CONN_MAX_AGE
  - Security: reviews purchase gate now requires payment_status=paid via `user_owns_catalog_item` (aligned with downloads)
  - Tests: new review entitlement case; targeted frontend suites + build OK; reviews/products/orders suites green
• Code scan & status reconciliation (2026-09-16)
  - Confirmed in code: R2 dual buckets + presigned downloads, catalog import + QA UI, invoice PDF download + receipt email, Meilisearch, Stripe cart + quotation pay, plugin cart CTAs live
  - Confirmed missing: legal pages, newsletter API, 3D fullscreen, DB activity-log UI, product tags, dedicated Search page
  - Docs refreshed: PROJECT_STATUS, PLANNED_FEATURES, IMPLEMENTATION_ROADMAP, MASTER_PLAN batch section
• Phase 1 team & product stability (2026-09-10)
  - Console EMAIL VERIFICATION LINK when DEBUG=True; `python manage.py verify_email`; Django admin action; SPA /admin/users email_verified
  - backend/.env.example completed (DB, FRONTEND_BASE_URL, CORS, Stripe, email, Redis-only-when-DEBUG=False, R2 optional)
  - Feature 16 Phase 9: API E2E import → QA approve → cart/checkout → webhook → entitled download
  - Feature 16 Phase 10: boto3/storage retries, models/{SKU}/ public media except package.zip, migrate_local_media_to_r2
  - Tests: 100 backend (auth/import/QA/checkout/download/E2E/storage); frontend AuthModal+Register 7/7; oxlint clean on touched files
• Marketplace Explore 3D Categories grid redesign (2026-09-09)
  - Reused GET /api/categories/ and renders only returned backend categories
  - Category images remain backend-driven with a safe visual fallback
  - Four-column desktop grid with responsive two- and one-column layouts
  - Existing category-ID filtering route preserved and tested
  - Tests: ProductsBrowsePage 8/8; frontend lint and production build passed
• Marketplace home module-card redesign (2026-09-09)
  - Reused the existing three-card section and internal routes
  - Matched the approved white layout, neutral dividers, illustrated icons, and pill CTAs
  - Added responsive stacked cards and verified all three destination links
  - Tests: ProductsBrowsePage 7/7; frontend lint and production build passed
• Feature 16 Phase 7 — Admin import QA queue UI (2026-09-07)
  - Products list: status + import_batch_id filters; QA queue shortcut (?status=pending_review)
  - Detail: Approve / Reject (reason required) / Requeue via dedicated endpoints
  - Publish-gate field errors surfaced in QA panel; public pages still omit reject_reason
• Feature 16 Phase 8 — QA approve / reject → publish workflow (2026-09-07)
  - QA metadata: reject_reason, qa_notes, reviewed_at, reviewed_by (admin serializers only)
  - POST approve / reject / requeue admin endpoints with ProductService publish gates
  - Imported (import_batch_id) products cannot PATCH/create as published; must use approve
  - Manual draft→published admin create/update unchanged; public catalog still published-only
  - Tests: test_product_qa + existing products / catalog_import suites
• Feature 16 Phase 6 — Catalog Import API (2026-09-03)
  - POST /api/admin/products/import/ — administrator JWT; batch JSON upsert by Model_ID → Product.sku
  - Ready-to-import gate per row (contract §E); mixed skip/create/update returns 200
  - Creates/updates as pending_review only; skips published/archived SKUs; never auto-publishes
  - Public thumb/preview via build_public_media_url; private package.zip on ProductFile.storage_path only
  - Gallery replace-all; single paid ProductFile sync; category resolve by name (optional subcategory child)
  - Tests: 13 catalog import + existing products suite (40 total) OK
• Feature 14B — Signed R2 download URLs (2026-09-03)
  - After entitlement + history write, private R2 objects return JSON { download_url, expires_in, file_name }
  - Filesystem / leftover local packages still stream via FileResponse
  - Frontend opens signed https URLs via temporary anchor; keeps blob path for local streams
  - Entitlements and order detail still expose only the authenticated API download path (no storage_path)
  - Tests: signed JSON happy path, plugin signed JSON, local fallback, missing file without history, non-owner 404, frontend JSON vs blob + javascript: rejection
• Customer auth popup (2026-09-02)
  - Sign in and Register open a dialog on the current page (navbar, home, product/plugin CTAs, wishlist, reviews, custom projects)
  - /login and /register remain shortcuts that open the popup on home and honor ProtectedRoute state.from
  - Register still does not auto-login (email verification); admin login stays /admin/login
  - returnTo is sanitized against open redirects; modal state is not persisted
• Customer Sign In / Register UI restyle (2026-09-02)
  - Shared Sign In / Register pill tabs; icon fields; show/hide password
  - Remember me on Sign In (maps to refresh cookie Max-Age; access never in localStorage)
  - Register collects optional phone and country (same fields as POST /api/auth/register/)
  - Phone and country stay optional on the API
  - Admin login, password reset, contact, and profile still use the original auth-card layout
• Feature 14 — Cloudflare R2 foundation (2026-09-01)
  - Named STORAGES public/private; S3/R2 only when all R2_* env vars are set
  - Images/previews/avatars → 3dam-public (R2_PUBLIC_BASE_URL); packages/project files → 3dam-private keys
  - Downloads still stream via FileResponse (Feature 14B signed URLs next)
  - storage_path CharField(max_length=512); migrations products 0005, plugins 0004, custom_projects 0008
  - Tests: products/test_storage.py routing + existing upload/download suites

• Global product search (navbar + URL sync) (2026-08-05)
  - Reused existing GET /api/products/?search= (no new API)
  - ProductSearchForm in Navbar navigates to /products?search=…
  - ProductsBrowsePage reads/writes search URL param (shareable deep links)
  - Client max length 100 aligned with ProductService._normalize_search
  - Tests: ProductSearchForm, Navbar search nav, browse URL search (16 related tests OK)
• Feature 16 Phase 4 — Freeze Batch Output Report + Phase 1 intake contracts (2026-08-04)
  - Contract: docs/batch-ingest-contract.md (report columns, intake columns, folder layout, R2 keys, gate, upsert)
  - Locked required-export policy: GLB Success + ≥1 of FBX/OBJ/MAX Success
  - Fixtures: docs/fixtures/batch-ingest/ happy + mismatch + gate-failures CSVs
  - Roadmap Input contracts + Phase 4 checkbox aligned to frozen doc
• Feature 16 Phase 3 — Product SKU / Model_ID identity (2026-08-04)
  - Backend: Product.sku (unique nullable Model_ID), import_batch_id, import_source, glb_checksum, has_thumbnail/has_preview/has_package
  - Backend: ProductService.get_by_sku + uniqueness/normalization; admin list ?sku= + search includes sku
  - Backend: Admin create/update accept sku + import metadata; blank SKU clears to null (multiple unset OK)
  - Frontend: admin create/edit SKU fields; list shows SKU column; search placeholder includes SKU
  - Tests: 7 new product SKU API tests (24/24 products suite); admin product UI tests updated
• Feature 15G — Quotation payment (2026-08-03)
  - Backend: OrderItem.product_type=custom_project; OrderService.create_from_quotation
  - Backend: POST /api/custom-projects/<id>/quotation/pay/ → Stripe Checkout Session
  - Backend: webhook marks project payment_status=paid and approved→in_progress; expiry reverts unpaid
  - Backend: zero-amount quotes fulfill without Stripe; receipt email reused
  - Frontend: Pay quotation / Continue payment on project detail; success/cancel project links
  - Tests: 8 quotation payment API tests; CustomerProjectDetailPage pay tests
• Feature 10 — In-app Notifications (2026-08-03) — **superseded 2026-09-18**
  - Shipped historically: notifications app, bell, /dashboard/notifications, fail-soft emits
  - Product decision: do not use an in-app inbox; alerts go out as automated email instead
  - Leftover UI/API is pending removal (not a Phase 1 required feature)
• Feature 11 — Admin Analytics (2026-08-03)
  - Backend: GET /api/admin/analytics/ (start_date/end_date; order counts, revenue, AOV, revenue_by_period, top_products, top_plugins, gateway_breakdown)
  - Backend: Dashboard monthly sales now query paid Orders (no placeholders)
  - Frontend: /admin/analytics cards + tables; Analytics nav enabled
  - Tests: 7 analytics API tests; 4 AdminAnalyticsPage + AdminLayout nav tests
• Feature 15F — Admin Payments UI (2026-07-31)
  - Backend: GET /api/admin/payments/ (filters: status, date range, search, ordering, pagination)
  - Backend: GET /api/admin/payments/:id/ (detail + linked order summary + Stripe reference IDs only)
  - Backend: AdminPaymentService; status aliases paid→succeeded, cancelled→expired
  - Backend: dashboard stats include payments.succeeded / payments.pending
  - Frontend: /admin/payments list + /admin/payments/:paymentId detail; Payments nav; dashboard paid count
  - Tests: admin payments API (guest/customer denied); frontend list/detail/api/dashboard tests
• Feature 8 — Order integrity hardening (2026-07-31)
  - Backend: OrderItem.title + OrderItem.slug snapshotted on admin create and cart checkout
  - Backend: migration 0002 backfills existing rows from Product/Plugin names
  - Backend: serializers prefer snapshot; live catalog fallback only when snapshot null
  - Backend: admin PATCH status transitions remain throttled + audited (AdminOrderWriteRateThrottle + log_admin_action)
  - Frontend: AdminOrderDetailPage shows only allowed order/payment status actions; slug column on line items
  - Tests: orders API 57 related backend tests OK; 16 frontend order tests OK
• Stripe Checkout Phase 1 — cart payments (2026-07-31)
  - Backend: payments app (Payment, StripeWebhookEvent), CheckoutService, WebhookService
  - Backend: POST /api/payments/checkout/; POST /api/payments/webhook/
  - Backend: OrderService.create_from_cart; cart line removal + coupon times_used on paid webhook
  - Frontend: useCheckout, CartPage/CartDrawer Checkout enabled, /checkout/success + /checkout/cancel
  - Frontend: success page polls order payment_status then links to downloads
  - Tests: payments API tests + cart checkout button redirect tests
• Public Site Pages — About, Contact, Custom Projects landing (2026-07-30)
  - Backend: contact app — POST /api/contact/ (AllowAny, ContactFormRateThrottle 5/hour)
  - Backend: ContactService emails CONTACT_ADMIN_RECIPIENTS (fallback PROJECT_MESSAGE_ADMIN_RECIPIENTS, then admins)
  - Backend: honeypot field, header-safe sanitization, non-blocking send_mail; 7 API tests
  - Frontend: AboutPage, ContactPage (Zod + RHF), CustomProjectsLandingPage with auth-aware CTAs
  - Frontend: SiteFooter; Navbar About/Contact/Custom Projects links; Home “Request custom work” CTA
  - Frontend: LoginPage honors ProtectedRoute state.from (safe path only)
• Coupons / Discount codes (2026-07-30)
  - Backend: coupons app (Coupon model, CouponService, admin CRUD APIs, audit logging, AdminCouponWriteRateThrottle)
  - Backend: Cart.coupon FK; POST/DELETE /api/cart/coupon/; server-side discount_amount + total on cart envelope
  - Backend: percent/fixed discounts capped at subtotal; stale/inactive/expired coupons cleared on cart GET
  - Backend: 27 coupons+cart API tests passing; times_used reserved for Feature 15 checkout increment
  - Frontend: AdminCouponsPage + AdminCouponDetailPage; Coupons admin nav
  - Frontend: CartCouponForm on CartPage + CartDrawer; subtotal / discount / total display
• Secure Downloads + Download History (2026-07-30)
  - Backend: downloads app (DownloadHistory model, DownloadService, entitlement via order+payment paid)
  - Backend: GET /api/downloads/entitlements/, /history/, product+plugin file download endpoints
  - Backend: GET /api/admin/downloads/history/; order detail exposes can_download + files[] on paid orders
  - Backend: 17 download API tests; DownloadRateThrottle (30/min)
  - Frontend: MyDownloadsPage (library + history tabs), CustomerOrderDetailPage download buttons
  - Frontend: AdminDownloadsPage audit table; Navbar/Dashboard links; downloadsApi blob helpers
  - Docs: DATABASE_STRUCTURE.md + DatabaseDesign.md download_history table documented
• Feature 7 — Customer Order History (2026-07-29)
  - Customer GET /api/orders/ + /api/orders/:id/ (owner-scoped)
  - MyOrdersPage + CustomerOrderDetailPage at /dashboard/orders
• Feature 6 — Shopping Cart (2026-07-29)
  - Backend cart app + APIs; CartPage, CartDrawer, AddToCartButton; checkout disabled until Stripe
• Reviews & Ratings (2026-07-30)
  - Purchase-gated create/update; public list; admin moderation; aggregates on product/plugin cards
• Public Plugin Store UI (Feature 3A + 3B — 2026-07-29)
  - PluginsBrowsePage + PluginDetailsPage at /plugins/:slug
• Feature 4 — Custom Project Portal completion (non-payment) (2026-07-29)
  - Backend: delivery-required guard before status=completed (_apply_status)
  - Backend: illegal status transitions from terminal states (completed/rejected/cancelled) rejected with 400
  - Backend: completion email (notify_project_completed) sent to customer on completed transition
  - Backend: DELETE /api/custom-projects/<id>/files/<file_id>/ — customer can delete own reference files from open projects
  - Backend: 18 new tests (ProjectCompletionGuardTests + ReferenceFileDeleteTests) — all passing
  - Frontend: StatusBadge component with 6 color variants applied to MyProjectsPage and CustomerProjectDetailPage
  - Frontend: upload progress bar (<progress>) on reference file upload form
  - Frontend: inline delete confirmation + Remove button for reference files on open projects
  - Frontend: "Pay quotation (coming soon)" disabled button when quotation=accepted, project not completed
  - Frontend: completed-state banner on CustomerProjectDetailPage
  - Frontend: "Requires at least one delivery" hint on AdminProjectDetailPage completed status option
  - Frontend: 39/39 tests passing across 3 updated test files
• Feature 2 — Interactive 3D Viewer (Phase 2A foundation + Phase 2C performance/hardening; product detail integration complete)
• Phase 2C — Viewer performance + hardening (GPU disposal, mobile DPR cap, off-screen pause, WebGL fallback, lifecycle tests)
• Phase 2A — Viewer foundation (lazy R3F ModelViewer, preview_model mount on product detail, image fallback, tests)
• Project setup (Django, React, PostgreSQL, JWT wiring)
• Customer registration / login / logout / refresh
• Email verification (register/resend/confirm + login gate for customers)
• Password reset + change password (with session invalidation)
• Customer profile + avatar upload
• Protected customer routes
• Customer My Projects list UI (/dashboard/projects)
• Customer project detail UI (/dashboard/projects/:projectId — fields, quote, files, states)
• Customer project messages UI (thread + composer on project detail)
• Admin project messages UI (thread + reply composer on /admin/projects/:projectId)
• Project message unread indicators (per-user last-read cursor, mark-read on open, unread badges on customer/admin lists)
• Project message attachments (ProjectMessageAttachment model; multipart create; owner+admin download; no storage_path in serializers; composer attach + thread download UI)
• Project message email notifications (customer→designer/admin recipients; admin→customer; title+deep link only; mail failure does not block create)
• Project creation email notifications (customer submit → assigned designer/admin recipients; title+customer+deep link only; mail failure does not block create)
• Project quotation email notifications (admin saves quote → customer email; customer accepts → staff email; title+deep link only; mail failure does not block action)
• Project delivery email notification (admin marks status=delivered → customer email; title+deep link; mail failure does not block status update)
• Orders backend Phase 15A (Order + OrderItem models, OrderService create/totals/status transitions, Django admin, 16 tests)
• Orders admin APIs Phase 15B (GET list/detail + POST create at /api/admin/orders/; filters order_status/payment_status/customer_id/search; live catalog title lookup; 8 API tests)
• Orders admin UI Feature 21 (/admin/orders list+create, /admin/orders/:orderId detail; nav + dashboard link; API module + tests)
• Quotation accept API (POST /api/custom-projects/:id/quotation/accept/ — customer only, throttled; sets ProjectQuotation.status=accepted, project.status=approved)
• Accept quotation UI on customer project detail (Accept quotation button visible when status=quoted and quotation.status=pending; optimistic cache update on success)
• Project message thread hardening (correct multi-admin labels; latest-window when >100 messages)
• Project delivery admin upload API (multipart; version auto/explicit; reuse project-file validation; storage_path never in response)
• Project delivery list/download APIs (admin + project owner; paginated list with download_url; authenticated FileResponse; private MEDIA blocked)
• Admin project deliverables UI (/admin/projects/:id — upload, list with name/version/notes/size/date, download, Mark delivered / Mark completed)
• Product categories (model, public list/detail, admin CRUD API)
• Marketplace products (model, public list/detail, admin CRUD API)
• Product images + files upload (validated MIME/extension/size; local MEDIA)
• Admin categories UI (list/create/edit/deactivate at /admin/categories)
• Admin products UI (list/create/edit/archive + image/file uploads at /admin/products)
• Admin layout & navigation (shared shell, sidebar, header, mobile menu)
• Admin home dashboard with live stats (users, products, categories, category breakdown, custom projects)
• Product upload polish (USDZ support, media upload UX on admin product detail)
• Plugin catalog backend (categories, CRUD, public APIs, image/package uploads, search/filtering)
• Admin dashboard live plugin total
• Plugins admin UI (list/create/edit/archive, filters, ordering, pagination)
• Plugin image and package upload/delete UI
• Plugin category admin management UI
• Custom projects backend (CustomProject, ProjectFile, ProjectQuotation, ProjectMessage, ProjectMessageReadState, ProjectMessageAttachment, ProjectDelivery)
• Customer custom-project APIs (create/list/detail + reference upload + delivery list/download)
• Admin custom-project APIs (list/create/detail/update + quotation upsert + delivery upload/list/download)
• Customer/admin project message APIs (list + create + mark-read + attachment download, ownership/RBAC, throttle, pagination)
• Custom projects admin UI (list/create/detail review, quote, assign designer)
• Admin dashboard live custom-project pending/live/completed counts
• Administrator role seed + createsuperuser → Administrator
• Dedicated /admin/login (email + password only)
• POST /api/auth/admin/login/ (Administrator-only tokens)
• Administrator redirect + AdminRoute gate
• Server-side IsAdministrator permission + /api/auth/admin/me/
• Admin dashboard shell (session verified)
• Admin user CRUD (list/create/update/soft-delete)
• Refresh token rotation + blacklist after rotation
• Production security headers (when DEBUG=False)
• Auth/admin/password-reset/email-verification security logging
• Public marketplace browse page (/products) UI (hero, search, category/license filters, sorting, pagination, skeletal loading, error state)
• Public product details page (/products/:slug) — Atelier-style two-column layout using brand cream/navy/blue tokens; gallery stage, purchase card, specs table, related products, SEO, auth-aware CTAs
Pending Features
• Operator: execute docs/PRODUCTION_CHECKLIST.md on staging/prod (Backend 10/10 engineering A–J done 2026-09-18)
• Feature 12 — Public site & navigation polish (partially shipped; About/Contact/landing done)
• Feature 15 remainder — PayPal/Razorpay only if still in scope (15G quotation payment shipped)
• Feature 16 — Batch Catalog Ingest & QA (Phases 3–10 done in this repo; desktop bridge .exe polish optional / separate repo)
  - Detailed 10-phase plan: IMPLEMENTATION_ROADMAP.md; contract: docs/batch-ingest-contract.md
• Invoice PDF generation (invoice_number + paid-order PDF/receipt already shipped; remaining polish if any)
• UI redesign pending manager prototype approval
Current Issues / Blockers
• Waiting on manager approval for UI prototype
• First Administrator: use `python manage.py ensure_administrator` (or createsuperuser); Google Sign-In needs matching `GOOGLE_OAUTH_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID` — see docs/AUTH_STAGING_CHECKLIST.md
• Cloudflare R2: code/tooling ready (`verify_r2`, `audit_published_packages`, docs/R2_STAGING_CHECKLIST.md); operator must set `R2_*` on staging/host and run audit before launch
Bugs
No Known Bugs
Technical Debt
• (none currently tracked for Phase 1 auth token revocation)
Important Decisions
• PostgreSQL selected as the primary database.
• JWT (SimpleJWT) for API authentication: Bearer access in memory; refresh via httpOnly Secure SameSite=Lax cookie (Path=/api/v1/auth/); rotate + blacklist retained.
• Access JWT includes claim `tv` = `User.token_version`; password change/reset increments `token_version` so outstanding access tokens fail immediately (refresh blacklist retained).
• Public catalog search: Meili required when `MEILI_REQUIRED` (default `not DEBUG`); otherwise Postgres icontains fallback. Canonical API is `/api/v1/` only (legacy `/api/` aliases removed).
• RBAC uses accounts.Role (Administrator / Customer); backend permissions never trust frontend alone.
• Customer login: POST /api/auth/login/; Admin login: POST /api/auth/admin/login/.
• Admin user DELETE soft-deactivates (is_active=False); protect last active admin and self-lockout.
• Product DELETE soft-archives (status=archived); public APIs only return status=published.
• Public product file responses omit storage_path; entitled customers receive download_url via orders/downloads APIs only.
• Plugin categories are separate from product categories; public plugin file responses omit storage_path.
• Plugin packages accept ZIP/RAR/7Z; ZIP metadata is scanned for traversal and expansion limits.
• Custom projects are independent from marketplace orders; status transitions are enforced server-side.
• Marketplace orders use a dedicated orders app (Order + OrderItem); product_type is product or plugin; purchase_price is snapshotted at order creation; only published catalog items are accepted; no FK to custom_projects.
• Order item titles/slugs are snapshotted on OrderItem at create (admin create + cart checkout); serializers prefer snapshot and fall back to live catalog only when snapshot is null.
• Customer custom-project file responses omit storage_path; admins can open reference files for review.
• Project messages are project-scoped threads; customer access is ownership-only (404 for others); admin_notes stay off message APIs.
• Project message unread state is a per-user last-read cursor (ProjectMessageReadState); own messages never count as unread.
• Project message attachments reuse project file MIME/extension/size rules; create is attach-on-send (multipart); downloads are owner+admin only via authenticated endpoints.
• Project message, creation, quotation, and delivery emails use Celery tasks (REDIS_URL broker) with retries; Django send_mail + FRONTEND_BASE_URL in the worker; bodies contain only minimal project context and deep links (no message body, quote amounts/notes, emails, tokens, or storage paths); mail/enqueue failures are logged and never roll back any project action; staff recipients resolve to assigned designer else PROJECT_MESSAGE_ADMIN_RECIPIENTS else active Administrator account emails (never DEFAULT_FROM_EMAIL as To); email bodies rendered from Django text templates in custom_projects/templates/custom_projects/emails/.
• Quotation accept: customer-only endpoint (IsAuthenticated, not IsAdministrator); requires project status=quoted and quotation.status=pending; transitions project to approved and quotation to accepted atomically; notifies staff after commit; other customers get 404 (not 403).
• Payment receipt emails are enqueued after Stripe fulfillment commits; webhook signature verification and in-process idempotent fulfillment are unchanged.
• Celery: broker = REDIS_URL; CELERY_TASK_ALWAYS_EAGER when Redis is unset (local DEBUG) or under tests; mail tasks use queue=`email` with `CELERY_TASK_ROUTES`; Compose worker listens `-Q celery,email`.
• Checkout Idempotency-Key (Phase H): optional header on cart checkout and quotation pay; cached 2xx JSON in Django cache for 24h under `idempotency:{scope}:{user_id}:{key}` (errors not cached).
• Legal acceptance (Phase I): `LEGAL_DOCUMENT_VERSIONS` (`terms`/`privacy`, env-overridable); register requires `accepted_legal`; checkout/quotation pay require current rows (or accept via request body / `POST /api/v1/auth/legal-acceptances/`). OpenAPI at `/api/v1/schema/`.
• Project deliveries use a dedicated ProjectDelivery model (not ProjectFile); version is a positive integer per project with a unique (project, version) constraint; admin upload reuses validate_project_file_upload + private deliveries/ storage prefix; API responses never include storage_path; customers have no delivery upload route; list/download is admin or project-owner only (other customers → 404; customers on admin routes → 403).
• Password reset uses Django PasswordResetTokenGenerator; responses never enumerate accounts.
• Email verification is enabled for customers: register sets email_verified=False and enqueues a Celery verification email; login returns 403 email_not_verified until confirmed. Checkout and custom-project create/accept/pay require IsEmailVerified. Google OAuth still trusts Google’s email_verified. Password change requires a verified email and sends a Celery security notification. Admin-created users remain email_verified=True; admin can still toggle email_verified.
• React Three Fiber selected for 3D previews.
• Public product detail CTAs gate checkout as coming soon; wishlist and cart are live for authenticated customers; guests are prompted to sign in; Share copies the public /products/:slug URL only.
• Wishlist uses dedicated wishlist app (WishlistItem); product_type is product or plugin; only published catalog items can be added; owner-only list/add/remove (IDOR → 404); write endpoints throttled; no payment dependency.
• Cart uses dedicated cart app (Cart + CartItem); product_type matches OrderItem (product | plugin); live catalog prices for subtotal; optional coupon discount applied server-side to subtotal; only published items can be added; owner-only CRUD (IDOR → 404); write endpoints throttled; checkout disabled until Feature 15.
• Coupons use dedicated coupons app; codes are uppercase unique; percent/fixed discounts capped at cart subtotal; times_used increments at Feature 15 checkout (not on apply); max_uses_per_user stored for checkout enforcement later.
• Catalog download entitlement requires order_status=paid AND payment_status=paid (stricter than reviews' order_status-only check); DownloadHistory logged per file fetch; total_downloads incremented on Product/Plugin.
• Customer order history (Feature 7): read-only GET /api/orders/ and GET /api/orders/:id/ scoped to request.user; customer dashboard at /dashboard/orders and /dashboard/orders/:orderId; paid orders expose per-item download files; library at /dashboard/downloads; line item titles/slugs use OrderItem snapshots (Feature 8).
• Admin analytics (Feature 11): order-based aggregates only; revenue counts payment_status=paid; gateway_breakdown is a stable array keyed by Payment.gateway for future PayPal/Razorpay without client breaks; date range capped at 366 days.
• Notification channel is **automated email only** (2026-09-18). No in-app notification inbox in Phase 1. Feature 10 bell/API/UI are absent from the repo (Phase J cleanup confirmed). Celery emails use `config.mail` + optional OutboundEmailLog.
• Postgres backups (Phase J + A5): `backend/scripts/backup_postgres.sh` (`pg_dump -Fc`, optional `BACKUP_RETENTION_DAYS` + `BACKUP_UPLOAD_R2`); disposable `restore_postgres_drill.sh`; runbook `docs/BACKUP_RESTORE_DRILL.md`. Live staging/prod cron + drill remains operator gate in PRODUCTION_CHECKLIST §2.6.
• Cloud storage: Cloudflare R2 selected (not dual-track AWS S3). Public bucket/CDN for thumbnails + preview GLBs; private bucket for paid packages. Metadata remains in PostgreSQL/Django.
• Batch ingest: MaxScript Batch Output Report is the post-render machine contract; Phase 1 intake Excel supplies price/marketing fields; join key is Model_ID. Bridge never auto-publishes — admin QA on the website is the final gate to status=published. Frozen detail: docs/batch-ingest-contract.md.
• R2 Key Prefix convention (locked Phase 4): models/{Model_ID}/ — report column must match.
• Required-export policy (locked Phase 4): GLB Success + ≥1 of FBX/OBJ/MAX Success; thumbnail via intake path or thumbnail.jpg; folder layout preview.glb / thumbnail.jpg / package.zip / textures/.
• Product.sku stores external Model_ID (uppercase unique when set); blank/null allowed for manually created products. Idempotent re-import must upsert by sku via ProductService.get_by_sku — same Model_ID updates draft/pending product, never duplicates.
• Recommended near-term order: execute docs/PRODUCTION_CHECKLIST.md on staging/prod; then Feature 12 polish.
• Quotation payment (Feature 15G): accepted quotes pay via POST /api/custom-projects/<id>/quotation/pay/ → Stripe Checkout; OrderItem.product_type=custom_project snapshots the project; webhook sets CustomProject.payment_status=paid and advances approved → in_progress; zero-amount quotes fulfill without Stripe; catalog downloads remain product/plugin only.
• Stripe full refund policy (Phase B, 2026-09-18): `charge.refunded` with `refunded=true` sets Payment.status=refunded and Order order_status+payment_status=refunded via OrderService.mark_refunded; partial refunds ignored. Download entitlement fails automatically (paid+paid). Quotation orders also set project payment_status=unpaid and, if status was in_progress, revert to approved; deliveries and quotation rows are not deleted. Idempotent StripeWebhookEvent insert unchanged; handler errors still surface via existing StripeWebhookView + capture_webhook_failure.
• Launch readiness Phase B1 — Stripe sandbox tooling (2026-09-18): `check_stripe_config` (+ `--require-test-mode` / `--fail-on-warnings` / `--ping`); prints key modes + webhook path/event types without secrets; `docs/STRIPE_SANDBOX_CHECKLIST.md` + PRODUCTION_CHECKLIST §2.5. Reuses CheckoutService / WebhookService / StripeWebhookEvent — operator still runs one real test-mode checkout; live keys = Phase K.
Daily Development Log
Date: 2026-09-18 (Launch readiness Phase B1 — Stripe keys + webhook verification)
Working Hours:
Today's Objective: Close B1 engineering/tooling gap (operator verify command + docs) without forking payment flow; leave live test checkout and Phase K live keys as operator work.
Modules Completed: check_stripe_config, stripe_config helpers, STRIPE_SANDBOX_CHECKLIST verify steps
Files Created:
• backend/payments/stripe_config.py
• backend/payments/management/__init__.py
• backend/payments/management/commands/__init__.py
• backend/payments/management/commands/check_stripe_config.py
• backend/payments/test_stripe_config.py
Files Modified:
• docs/STRIPE_SANDBOX_CHECKLIST.md
• docs/PRODUCTION_CHECKLIST.md §2.5
• .env.example, backend/.env.example
• implementingFIXfeature.md, PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None (existing POST /api/v1/payments/webhook/ unchanged)
Frontend Pages Created/Updated:
• None
Problems Encountered:
• Real Stripe Dashboard/CLI test checkout cannot be completed from this session alone — operator checkbox remains
Solutions Implemented:
• Reused WebhookService event types + existing signature verification; added management command mirroring check_email_config / verify_r2
Security Review:
• check_stripe_config never prints secret/publishable/webhook secret values — only modes and presence flags
• --require-test-mode rejects sk_live_ / pk_live_ for sandbox phase
• --ping uses Balance.retrieve only; errors surfaced without key material
• Webhook still requires STRIPE_WEBHOOK_SECRET; missing secret → 503; bad signature → 400
Next Steps:
• Operator: check_stripe_config --require-test-mode [--ping]; stripe listen; one test card checkout + webhook replay
Date: 2026-09-18 (Launch readiness Phase A5 — backup + restore drill)
Working Hours:
Today's Objective: Close A5 engineering gaps (retention, disposable restore proof, cron docs) without rewriting existing backup/upload helpers; leave live host drill as operator work.
Modules Completed: BACKUP_RETENTION_DAYS prune, restore_postgres_drill.sh, BACKUP_RESTORE_DRILL.md, checklist §2.6
Files Created:
• backend/scripts/restore_postgres_drill.sh
• docs/BACKUP_RESTORE_DRILL.md
Files Modified:
• backend/scripts/backup_postgres.sh (retention prune + drill hints)
• backend/config/test_backup_scripts.py
• docs/PRODUCTION_CHECKLIST.md §0 / §2.6
• .env.example, backend/.env.example
• implementingFIXfeature.md, PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Created/Updated:
• None
Problems Encountered:
• This Windows workstation cannot run WSL bash / Compose without root `.env` — live dump+restore left as operator checkbox on Linux staging/prod
Solutions Implemented:
• Reused backup_postgres.sh + upload_backup_to_r2.py; added disposable Docker restore that never mounts postgres_data; documented cron + local/R2 retention split
Security Review:
• Dumps stay under gitignored `backups/`; drill password is ephemeral and local-only
• Restore script does not target Compose postgres_data; in-place staging restore remains manual + documented
• R2 upload still uses existing env keys only; no secrets in scripts/docs
• Confirmed R2 object recovery is documented as separate from Postgres restore
Next Steps:
• Operator: execute docs/BACKUP_RESTORE_DRILL.md on staging (dump, disposable drill, migrate/healthz/smoke, cron, R2 lifecycle)
Date: 2026-09-18 (Launch readiness Phase A3 — SMTP + refuse console email)
Working Hours:
Today's Objective: Confirm Phase A3 tooling/guard is production-ready, document status, and leave live SMTP as operator work.
Modules Completed: ALLOW_CONSOLE_EMAIL boot guard, check_email_config, SMTP_STAGING_CHECKLIST, Compose web/worker EMAIL_* parity
Files Created:
• backend/accounts/management/commands/check_email_config.py
• backend/accounts/test_phase_a3_email.py
• docs/SMTP_STAGING_CHECKLIST.md
Files Modified:
• backend/config/settings.py (ALLOW_CONSOLE_EMAIL + ImproperlyConfigured when DEBUG=False + console)
• backend/config/test_health.py (console-email guard mirror test)
• docker-compose.yml (web + worker EMAIL_* / ALLOW_CONSOLE_EMAIL)
• .env.example, backend/.env.example
• docs/PRODUCTION_CHECKLIST.md §1 Email / §2.4
• implementingFIXfeature.md, PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Created/Updated:
• None
Problems Encountered:
• Real SMTP credentials and inbox delivery cannot be set from the repo — left as operator checkbox
Solutions Implemented:
• Reused Celery mail tasks / enqueue_after_commit; boot-time refuse of console when DEBUG=False; management command for operator smoke
Security Review:
• No SMTP passwords committed; check_email_config prints only *_set flags for credentials
• Console backend still allowed under DEBUG=True and tests; production must set ALLOW_CONSOLE_EMAIL=False + SMTP
• Existing mail paths unchanged (accounts/orders/contact/custom_projects tasks)
Next Steps:
• Operator: follow docs/SMTP_STAGING_CHECKLIST.md on staging (web+worker SMTP + recipients + --send-test-email)
Date: 2026-09-18 (Launch readiness Phase A2 — prod secrets / hosts / TLS)
Working Hours:
Today's Objective: Ship operator tooling for production secrets, hosts, and TLS clarity without inventing new env vars; leave live host values as operator work.
Modules Completed: check_deploy_config, deploy_checks system checks, DEPLOY_SECRETS_STAGING_CHECKLIST, checklist §1/§2.1 wiring
Files Created:
• backend/config/deploy_checks.py
• backend/accounts/management/commands/check_deploy_config.py
• backend/config/test_deploy_checks.py
• docs/DEPLOY_SECRETS_STAGING_CHECKLIST.md
Files Modified:
• backend/accounts/apps.py
• .env.example, backend/.env.example
• docs/PRODUCTION_CHECKLIST.md
• implementingFIXfeature.md, PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Created/Updated:
• None
Problems Encountered:
• Live host secrets / TLS cannot be set from the repo — left as operator checkbox
Solutions Implemented:
• Reused check_* command pattern + Meili/FRONTEND localhost helpers; optional Django check --deploy integration
Security Review:
• No secrets committed; example placeholders stay non-secret; command never prints SECRET_KEY / DB_PASSWORD values
• Custom deploy checks flag example SECRET_KEY and ALLOWED_HOSTS=*
Next Steps:
• Operator: follow docs/DEPLOY_SECRETS_STAGING_CHECKLIST.md on staging/prod
Date: 2026-09-18 (Backend 10/10 Phase J — ops backup + cleanup)
Working Hours:
Today's Objective: Ship runnable Postgres backup + R2 upload helpers; link checklist; confirm Feature 10 remnants gone; close Backend 10/10 engineering.
Modules Completed: backup_postgres.sh, upload_backup_to_r2.py, PRODUCTION_CHECKLIST §2.6, docs cleanup
Files Created:
• backend/scripts/backup_postgres.sh
• backend/scripts/upload_backup_to_r2.py
• backend/config/test_backup_scripts.py
Files Modified:
• docs/PRODUCTION_CHECKLIST.md, BACKEND_10_IMPLEMENTATION_PLAN.md, PLANNED_FEATURES.md, DatabaseDesign.md
• PROJECT_STATUS.md, .gitignore
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Created/Updated:
• None (Feature 10 inbox already absent)
Problems Encountered:
• Live staging restore drill cannot be executed from the repo — left as operator checkbox
Solutions Implemented:
• Same R2_* env + boto3 for optional dump upload; Compose or direct pg_dump paths
Security Review:
• Dumps gitignored; private bucket prefix backups/postgres/; restore instructions staging-only
Tests:
• config.test_backup_scripts (upload helper, no network)
Next Development Task:
• Operator: PRODUCTION_CHECKLIST on staging; Feature 12 polish
Date: 2026-09-18 (Backend 10/10 Phase I — LegalAcceptance + OpenAPI)
Working Hours:
Today's Objective: Store legal acceptance proof; gate register/checkout; ship OpenAPI schema.
Modules Completed: LegalAcceptance model/service, register+checkout gates, legal endpoints, drf-spectacular
Files Created:
• backend/accounts/legal_service.py
• backend/accounts/migrations/0006_legal_acceptance.py
• backend/accounts/test_legal_acceptance.py
• backend/config/test_openapi.py
• frontend/src/lib/legalDocuments.ts
Files Modified:
• backend/accounts/models.py, serializers.py, services.py, views.py, urls.py, admin.py, tests
• backend/payments/checkout_service.py, payment_common.py, views.py, test_payments.py
• backend/custom_projects/views.py
• backend/config/settings.py, api_urls.py, requirements.txt
• backend/products/test_catalog_commerce_e2e.py, seed_e2e_commerce.py
• frontend register types/form/tests
• .github/workflows/ci.yml
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md, PROJECT_STATUS.md, backend/.env.example
Database Changes:
• accounts.LegalAcceptance (legal_acceptances)
API Endpoints Added, Modified, or Removed:
• GET /api/v1/auth/legal-documents/
• POST /api/v1/auth/legal-acceptances/
• POST register — requires accepted_legal
• POST checkout / quotation pay — require legal (optional accepted_legal body)
• GET /api/v1/schema/ (+ swagger-ui)
Frontend Pages Created/Updated:
• Register payload includes accepted_legal (checkbox already required in UI)
Problems Encountered:
• spectacular --validate noisy on APIViews without serializers — CI generates schema only
Solutions Implemented:
• LegalAcceptanceService shared by register + checkout; E2E buyer seed records acceptances
Security Review:
• Versions scoped per user; read-only admin for LegalAcceptance; no secrets in legal payload
Tests:
• accounts.test_legal_acceptance + checkout legal gate + OpenAPI schema smoke
Next Development Task:
• Phase J — ops backup, cleanup, PRODUCTION_CHECKLIST proof
Date: 2026-09-18 (Backend 10/10 Phase H — idempotency + email queue)
Working Hours:
Today's Objective: Idempotency-Key on checkout/quotation pay; Celery email queue; verify throttle gaps.
Modules Completed: config.idempotency, checkout/quotation pay wiring, mail task queues, compose worker -Q
Files Created:
• backend/config/idempotency.py
• backend/config/test_idempotency.py
Files Modified:
• backend/payments/views.py, test_payments.py, test_quotation_payments.py
• backend/custom_projects/views.py
• backend/accounts/tasks.py, orders/tasks.py, custom_projects/tasks.py, contact/tasks.py
• backend/config/settings.py, test_celery.py
• docker-compose.yml
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md, PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• POST checkout + quotation pay — honor optional Idempotency-Key (same response on replay)
Frontend Pages Created/Updated:
• None
Problems Encountered:
• None
Solutions Implemented:
• Cache 2xx only so validation errors remain retryable with same key; single worker listens to celery+email
Security Review:
• Keys scoped by user (+ project for quotation); no secrets in cache payload beyond checkout URLs/order ids already returned to client
Tests:
• Idempotency helper + checkout/quotation double-POST + Celery queue/route assertions
Next Development Task:
• Phase I — LegalAcceptance + optional OpenAPI
Date: 2026-09-18 (Backend 10/10 Phase B — Stripe refunds)
Working Hours:
Today's Objective: Handle Stripe charge.refunded so refunded buyers lose download entitlement and quotation projects revert payment state without breaking checkout.
Modules Completed: WebhookService refund handler, OrderService.mark_refunded, CustomProjectService.revert_quotation_after_refund, tests
Files Created:
• None
Files Modified:
• backend/payments/services.py
• backend/orders/services.py
• backend/custom_projects/services.py
• backend/payments/test_payments.py
• backend/payments/test_quotation_payments.py
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• POST /api/v1/payments/webhook/ — now processes charge.refunded (same URL)
Frontend Pages Created/Updated:
• None
Problems Encountered:
• IN_PROGRESS→APPROVED is outside normal project status graph; refund path sets status directly (documented)
Solutions Implemented:
• Full-refund-only gate on charge.refunded boolean; reuse Order status transition maps; entitlement via existing helpers
Security Review:
• Unknown payment_intent is no-op (event still recorded for idempotency); non-succeeded payments ignored; webhook signature path unchanged
Tests:
• StripeWebhookTests + QuotationWebhookTests — 14 OK
Next Development Task:
• Phase I — LegalAcceptance + optional OpenAPI
Date: 2026-09-18 (Backend 10/10 Phase G — Meili + legacy API)
Working Hours:
Today's Objective: Require Meili in prod; remove unversioned /api/ aliases; tighten refresh cookie path.
Modules Completed: MEILI_REQUIRED, healthz/search 503, legacy middleware removal, cookie path
Files Created:
• None (legacy_api.py deleted)
Files Modified:
• backend/config/settings.py, health.py, urls.py, api_urls.py
• backend/search/client.py, services.py, test_public_list.py
• backend/accounts/auth_cookies.py, exceptions.py
• backend/config/test_*.py
• backend/.env.example, .env.example, docs/PRODUCTION_CHECKLIST.md
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md, PROJECT_STATUS.md, docs/PLANNED_FEATURES.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• Removed legacy unversioned `/api/*` aliases (404)
• Public search with query may return 503 `search_unavailable` when Meili required+down
Frontend Pages Created/Updated:
• None (already on /api/v1)
Problems Encountered:
• Accidental api_urls truncate while editing docstring — restored with activity-logs include
Solutions Implemented:
• MEILI_REQUIRED gate in health + search; dual-clear cookies for one release
Security Review:
• Prod cannot report healthy without Meili when required; cookie Path narrowed to auth
Tests:
• config health/legacy/versioning + search.test_public_list — 25 OK
Date: 2026-09-18 (Backend 10/10 Phase F — access token revocation)
Working Hours:
Today's Objective: Invalidate access JWTs on password change/reset via token_version + tv claim.
Modules Completed: token_version model, VersionedRefreshToken, VersionedJWTAuthentication, refresh tv gate
Files Created:
• backend/accounts/tokens.py
• backend/accounts/authentication.py
• backend/accounts/migrations/0005_user_token_version.py
Files Modified:
• backend/accounts/models.py
• backend/accounts/services.py
• backend/accounts/views.py (CookieTokenRefreshView tv check)
• backend/config/settings.py
• backend/accounts/tests.py
• backend/accounts/test_password_reset.py
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md
• PROJECT_STATUS.md
• docs/PLANNED_FEATURES.md
Database Changes:
• users.token_version PositiveIntegerField default 0
API Endpoints Added, Modified, or Removed:
• None (auth behavior change only)
Frontend Pages Created/Updated:
• None
Problems Encountered:
• Stale Bearer on AllowAny login returns 401 — tests clear credentials before re-login
Solutions Implemented:
• Bump token_version + embed tv; auth compares claims; refresh cookie also checks tv
Security Review:
• Missing tv treated as 0 (pre-migration tokens); mismatch → InvalidToken/401; refresh blacklist kept
Tests:
• ChangePasswordAPITests + PasswordResetAPITests — OK (incl. stale access cases)
Date: 2026-09-18 (Backend 10/10 Phase E — service facades)
Working Hours:
Today's Objective: Split fat custom_projects and payments services behind stable facades; zero URL/serializer change.
Modules Completed: CP domain mixins + payments admin/checkout/webhook modules
Files Created:
• backend/custom_projects/service_common.py
• backend/custom_projects/project_service.py
• backend/custom_projects/quotation_service.py
• backend/custom_projects/message_service.py
• backend/custom_projects/delivery_service.py
• backend/payments/payment_common.py
• backend/payments/admin_payment_service.py
• backend/payments/checkout_service.py
• backend/payments/webhook_service.py
Files Modified:
• backend/custom_projects/services.py (facade only)
• backend/payments/services.py (facade + re-exports)
• backend/payments/test_payments.py, test_quotation_payments.py (stripe patch paths)
• backend/products/test_catalog_commerce_e2e.py (stripe patch path)
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md
• PROJECT_STATUS.md
• docs/PLANNED_FEATURES.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Created/Updated:
• None
Problems Encountered:
• Stripe mocks must target checkout_service after split (import-bound name)
Solutions Implemented:
• Multiple-inheritance facade for CustomProjectService; payments modules re-exported from services.py
Security Review:
• No authz/payment logic changes; transactions and select_for_update preserved
Tests:
• custom_projects + payments — 152 OK
Date: 2026-09-18 (Backend 10/10 Phase D — custom-project R2 parity)
Working Hours:
Today's Objective: Ensure custom-project private downloads share resolve_private_download; extend local→R2 migration for CP prefixes.
Modules Completed: media_migration CP private keys; signed-download tests for files/attachments/deliveries
Files Created:
• None
Files Modified:
• backend/config/media_migration.py (ProjectFile / attachment / delivery private copy)
• backend/products/management/commands/migrate_local_media_to_r2.py (help text)
• backend/products/test_media_migration.py
• backend/products/test_storage.py (CP prefixes not public)
• backend/custom_projects/test_custom_projects.py (signed JSON for file + attachment)
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md
• PROJECT_STATUS.md
• docs/PLANNED_FEATURES.md
Database Changes:
• None (migrate accounts ActivityLog already applied; Phase D is storage/path parity only)
API Endpoints Added, Modified, or Removed:
• None (download URLs unchanged; response shape already signed JSON or FileResponse)
Frontend Pages Created/Updated:
• None
Problems Encountered:
• Download views already used resolve_private_download; remaining gap was migration coverage + file/attachment signed tests
Solutions Implemented:
• Reuse LocalMediaMigrationService._migrate_private_key for all three CP private models
Security Review:
• custom_projects/* remains outside PUBLIC_MEDIA_PREFIXES; /media/ still 404 for those keys
Tests:
• products.test_media_migration + MediaPathTests + targeted custom_projects signed-download tests — OK
Date: 2026-09-18 (Backend 10/10 Phase C — ActivityLog)
Working Hours:
Today's Objective: Persist admin actions to ActivityLog via existing log_admin_action; add admin list API; keep fail-soft.
Modules Completed: ActivityLog model, security_log persist, admin list API, Django admin, tests
Files Created:
• backend/accounts/migrations/0004_activity_log.py
• backend/accounts/activity_service.py
• backend/accounts/admin_activity_urls.py
• backend/accounts/test_activity_log.py
Files Modified:
• backend/accounts/models.py (ActivityLog)
• backend/accounts/security_log.py (fail-soft persist)
• backend/accounts/serializers.py (ActivityLogSerializer)
• backend/accounts/views.py (AdminActivityLogListView)
• backend/accounts/admin.py (read-only ActivityLogAdmin)
• backend/config/api_urls.py (admin/activity-logs/)
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md
• PROJECT_STATUS.md
• docs/PLANNED_FEATURES.md
• DATABASE_STRUCTURE.md / docs/DatabaseDesign.md
Database Changes:
• New table activity_logs (UUID PK; actor FK SET NULL; action; target_id; metadata JSON; created_at; indexes)
API Endpoints Added, Modified, or Removed:
• GET /api/v1/admin/activity-logs/ — Administrator; filters action, actor_id, target_id
Frontend Pages Created/Updated:
• None (admin UI optional later)
Problems Encountered:
• Duplicate ActivityLog class briefly introduced during implementation; removed (related_name=activity_logs matches migration)
Solutions Implemented:
• Single write path in log_admin_action; list via ActivityLogService; DB failures never raise to admin APIs
Security Review:
• Administrator-only list; actor resolved by UUID; metadata JSON only from trusted admin call sites
Tests:
• accounts/test_activity_log.py — 5 OK
Date: 2026-09-18 (Backend 10/10 Phase A — mail kernel + log + resend)
Working Hours:
Today's Objective: Implement Phase A without breaking existing mail/workflow behavior: shared helpers, OutboundEmailLog, wire deliver paths, admin quotation resend.
Modules Completed: config.mail, mail_log app, notification wiring, resend API, tests
Files Created:
• backend/config/mail.py
• backend/mail_log/ (apps, models, services, admin, migrations/0001, test_mail_log)
Files Modified:
• backend/config/settings.py (INSTALLED_APPS += mail_log)
• backend/custom_projects/notifications.py
• backend/custom_projects/services.py (resend_quotation_email)
• backend/custom_projects/views.py + admin_urls.py
• backend/orders/notifications.py
• backend/accounts/services.py
• backend/contact/services.py
• backend/custom_projects/test_custom_projects.py
• backend/contact/test_contact.py
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md
• PROJECT_STATUS.md
Database Changes:
• New table outbound_email_logs (UUID PK; event_type; status; recipient_hash; related_object_*; subject; error; timestamps)
API Endpoints Added, Modified, or Removed:
• POST /api/v1/admin/custom-projects/<uuid>/quotation/resend-email/ [added]
Frontend Pages Created/Updated:
• None (admin UI button optional later)
Problems Encountered:
• Existing tests patched custom_projects.notifications.send_mail / contact.services.send_mail — updated to config.mail.send_mail
Solutions Implemented:
• Central _send/_skip in project notifications records queued/sent/failed/skipped; SMTP errors still re-raised for Celery retry; log writes are fail-soft
Security Review:
• Recipient emails stored only as sha256:… hashes; subjects sanitized via safe_email_text; resend does not include quote amounts/notes
Tests:
• mail_log + CustomProjectWorkflowEmailNotificationTests + CustomProjectMessageEmailNotificationTests + contact.test_contact — OK
• StripeWebhookTests receipt cases + project create email — OK
Next Development Task:
• Phase B — Stripe refund webhooks (extend WebhookService)
Date: 2026-09-18 (Backend 10/10 implementation plan)
Working Hours:
Today's Objective: Publish a detailed, file-level backend 10/10 plan that preserves working code and mandates reuse of existing helpers (enqueue_after_commit, resolve_private_download, log_admin_action, WebhookService).
Modules Completed: Documentation only — docs/BACKEND_10_IMPLEMENTATION_PLAN.md (Phases A–J)
Files Created:
• docs/BACKEND_10_IMPLEMENTATION_PLAN.md
Files Modified:
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• None (plan only; Phase A will add mail_log.OutboundEmailLog)
API Endpoints Added, Modified, or Removed:
• None yet (Phase A will add admin quotation resend-email)
Frontend Pages Created/Updated:
• None
Problems Encountered:
• None
Solutions Implemented:
• Phased plan with reuse map, facade refactor rules, test matrix, and explicit out-of-scope (no in-app notifications rewrite)
Security Review:
• Plan requires hashed recipient in email logs; refunds revoke entitlement via existing paid+paid gates; ActivityLog via existing log_admin_action
Tests:
• N/A (plan only)
Next Development Task:
• Phase A — config/mail.py helpers + mail_log app + wire deliver_* + admin quotation resend
Date: 2026-09-18 (Email-only alerts; drop in-app notifications from plan)
Working Hours:
Today's Objective: Update project status and implementation plan so Phase 1 does not require an in-app notification inbox; customer/staff alerts are automated email (quotation/offer, messages, delivery, receipts).
Modules Completed: Docs only — product decision recorded; leftover Feature 10 UI/API listed as cleanup
Files Created:
• None
Files Modified:
• PROJECT_STATUS.md
• PROJECT_MASTER_PLAN.md
• docs/PLANNED_FEATURES.md
• DATABASE_STRUCTURE.md
• docs/DatabaseDesign.md
Database Changes:
• None (notifications table still exists in code; removal is pending cleanup, not this change)
API Endpoints Added, Modified, or Removed:
• None (Notification APIs remain until leftover Feature 10 is removed)
Frontend Pages Created/Updated:
• None (NotificationBell / NotificationsPage remain until leftover Feature 10 is removed)
Problems Encountered:
• Feature 10 in-app notifications already shipped 2026-08-03; plan now treats them as unused leftover rather than rewriting code in this pass
Solutions Implemented:
• Locked decision: automated Celery email is the notification channel; in-app inbox is out of Phase 1 scope
Security Review:
• Existing project/auth emails already omit secrets, quote amounts, message bodies, and storage paths; that rule stays
Tests:
• N/A (documentation-only)
Next Development Task:
• Optional cleanup: remove in-app notification app/UI; otherwise Sprint 11 production checklist on host
Date: 2026-09-17 (Production checklist runbook)
Working Hours:
Today's Objective: Close the Sprint 11 “formal security / production deploy” documentation gap with an operator runbook (env gates, check --deploy, backup/webhook drills, worker+mail, rollback) without claiming live Production Ready.
Modules Completed: docs/PRODUCTION_CHECKLIST.md; Compose web SMTP env parity; Nginx X-Forwarded-Proto for TLS-at-proxy
Files Created:
• docs/PRODUCTION_CHECKLIST.md
Files Modified:
• docker-compose.yml
• frontend/nginx.conf
• .env.example
• backend/.env.example
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Created/Updated:
• None (Nginx proxy header hardening only)
Problems Encountered:
• Live Production Ready still requires a host with real SMTP/Stripe/R2/Sentry — Compose defaults stay console/empty by design
Solutions Implemented:
• Runbook separates repo-ready vs operator sign-off; rollback policy prefers image tags + expand/contract migrations over migrate reverse
Security Review:
• No secrets committed; console email / empty Stripe-R2-Sentry remain safe defaults
• E2E_STRIPE_SIMULATE still blocked with sk_live_
• Nginx forwards edge X-Forwarded-Proto so SECURE_SSL_REDIRECT / Secure cookies work behind Cloudflare
• Web + worker both receive SMTP env so management-command mail and Celery mail use the same backend
Tests:
• N/A for runbook; reuse existing healthz / Stripe webhook / Celery unit coverage
Next Development Task:
• Execute PRODUCTION_CHECKLIST on staging/prod host; Feature 12 public polish
Date: 2026-09-17 (Email verification re-enabled)
Working Hours:
Today's Objective: Re-enable email verification (register unverified + Celery mail + login gate), gate checkout/custom projects, and add password-change security email pipeline.
Modules Completed: EmailVerificationService restored; IsEmailVerified permission; password-changed Celery task; SPA verify-email UX
Files Created:
• None (reused existing accounts email verification + Celery task modules)
Files Modified:
• backend/accounts/services.py
• backend/accounts/tasks.py
• backend/accounts/permissions.py
• backend/accounts/security_log.py
• backend/accounts/views.py
• backend/accounts/test_email_verification.py
• backend/accounts/tests.py
• backend/payments/views.py
• backend/custom_projects/views.py
• frontend/src/App.tsx
• frontend/src/pages/Login/useLoginForm.ts
• frontend/src/components/auth/AuthLoginPanel.tsx
• frontend/src/components/auth/AuthRegisterPanel.tsx
• frontend/src/components/auth/AuthModal.test.tsx
• frontend/src/pages/Register/RegisterPage.test.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• POST /api/v1/auth/register/ — creates unverified user + enqueues verification email
• POST /api/v1/auth/login/ — 403 email_not_verified for unverified customers
• POST /api/v1/auth/email-verification/resend/ — enqueues verification email (non-enumerating)
• POST /api/v1/auth/email-verification/confirm/ — marks verified (unchanged contract)
• POST /api/v1/auth/change-password/ — requires verified email; enqueues password-changed notice
• POST /api/v1/payments/checkout/ — requires IsEmailVerified
• POST /api/v1/payments/checkout/confirm/ — requires IsEmailVerified
• POST /api/v1/custom-projects/ — list/create requires IsEmailVerified
• POST /api/v1/custom-projects/<id>/quotation/accept/ — requires IsEmailVerified
• POST /api/v1/custom-projects/<id>/quotation/pay/ — requires IsEmailVerified
Frontend Pages Created:
• None (restored existing EmailVerification pages)
Frontend Pages Modified:
• /verify-email/:uid/:token — active again
• /verify-email/resend — active again
• Auth register success — prompts email verification
• Auth login — resend link on email_not_verified
Problems Encountered:
• None
Solutions Implemented:
• Restored prior EmailVerificationService; wired Celery like password reset; added password-changed notice task
Lessons Learned:
• Login gate plus IsEmailVerified on money paths covers both UX and defense-in-depth
Next Development Task:
• Formal security testing / production deployment checklist
Date: 2026-09-17 (Browser E2E Playwright)
Working Hours:
Today's Objective: Add Playwright browser E2E for login → cart → checkout → success/confirm → download; run in CI against Compose with Stripe test-mode simulation (never log secrets).
Modules Completed: Playwright suite; E2E_STRIPE_SIMULATE checkout/confirm; seed_e2e_commerce; Compose overlay; CI e2e job
Files Created:
• e2e/package.json
• e2e/package-lock.json
• e2e/playwright.config.ts
• e2e/tsconfig.json
• e2e/helpers/auth.ts
• e2e/tests/checkout-flow.spec.ts
• docker-compose.e2e.yml
• backend/products/management/commands/seed_e2e_commerce.py
• frontend/public/fixtures/e2e-preview.glb
Files Modified:
• backend/config/settings.py
• backend/payments/services.py
• backend/payments/test_payments.py
• backend/.env.example
• .env.example
• docker-compose.yml
• .github/workflows/ci.yml
• .gitignore
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Features Implemented:
• Browser E2E covering login, 3D viewer mount, cart, checkout success confirm, entitled download
• Gated Stripe simulate path for CI (sk_test_ only; refuses sk_live_)
• Compose overlay + GitHub Actions e2e job
API Endpoints Added: none
API Endpoints Modified: none (checkout/confirm behavior gated by E2E_STRIPE_SIMULATE)
Database Changes: none
Frontend Pages Created: none
Problems Encountered:
• Hosted Stripe Checkout is unsuitable for deterministic CI without account secrets
Solutions Implemented:
• E2E_STRIPE_SIMULATE returns SPA success URL and fulfills via the same webhook handler path on confirm
Lessons Learned:
• Keep browser E2E fulfillment aligned with production confirm/webhook code paths
Next Development Task:
• Sprint 11 formal security review / production deployment sign-off
Date: 2026-09-17 (API versioning /api/v1)
Working Hours:
Today's Objective: Mount REST APIs under /api/v1/; keep unversioned /api/ as one-release aliases without changing auth or entitlement rules.
Modules Completed: Shared api_urls; legacy path alias middleware; frontend /api/v1 client paths; dual-path cookie clear
Files Created:
• backend/config/api_urls.py
• backend/config/legacy_api.py
• backend/config/test_api_versioning.py
• backend/config/test_legacy_api.py
Files Modified:
• backend/config/urls.py
• backend/config/settings.py
• backend/accounts/auth_cookies.py
• backend/downloads/services.py
• backend/custom_projects/serializers.py
• backend/custom_projects/test_custom_projects.py
• backend/.env.example
• docker-compose.yml
• frontend/src/api/client.ts
• frontend/src/api/*.ts (and *.test.ts)
• frontend/src/pages/Dashboard/* (download_url / pagination fixtures)
• frontend/src/pages/Admin/AdminProjectMessagesSection.test.tsx
• frontend/src/pages/Admin/AdminProjectDeliveriesSection.test.tsx
• frontend/.env.example
• frontend/vite.config.ts
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• Canonical: all previous /api/... routes now at /api/v1/... (same views/permissions)
• Legacy aliases: /api/... still resolve via middleware rewrite (one release)
• reverse() names now resolve to /api/v1/... (e.g. healthz, accounts:login)
• Download URL builders emit /api/v1/downloads/... and /api/v1/custom-projects/...
Frontend Pages Created/Updated:
• No new pages; all apiClient call sites use /api/v1/
Issues Found:
• Django Set-Cookie cannot dual-emit same cookie name for two Path values — used Path=/api/ for the alias window
Next Steps:
• After mobile/public clients migrate, remove LegacyApiPathAliasMiddleware and tighten JWT_REFRESH_COOKIE_PATH to /api/v1/auth/
Security Review:
• Auth/entitlement code paths unchanged; only URL prefix + cookie Path scoping
• No secrets exposed; JWT still httpOnly; logout clears /api/, /api/auth/, /api/v1/auth/ cookie paths
• Stripe webhook still reachable at legacy /api/payments/webhook/ and /api/v1/payments/webhook/
Definition of Done:
• [x] Requirements matched; patterns reused; production-ready
• [x] Security checklist reviewed for this change
• [x] Tests: config versioning/legacy + accounts.tests; frontend api + related page tests green
• [x] PROJECT_STATUS.md updated
Date: 2026-09-17 (JWT httpOnly refresh cookie)
Working Hours:
Today's Objective: Stop persisting JWTs in localStorage; access in memory; refresh via httpOnly cookie with rotate+blacklist.
Modules Completed: Auth cookie helpers; cookie login/refresh/logout; frontend memory session + Vite proxy; SPA CSP
Files Created:
• backend/accounts/auth_cookies.py
Files Modified:
• backend/config/settings.py
• backend/.env.example
• backend/accounts/views.py
• backend/accounts/serializers.py
• backend/accounts/urls.py
• backend/accounts/tests.py
• backend/accounts/test_google_login.py
• backend/accounts/test_admin_access.py
• backend/accounts/test_password_reset.py
• frontend/src/store/authStore.ts
• frontend/src/api/client.ts
• frontend/src/api/authApi.ts
• frontend/src/types/auth.ts
• frontend/src/hooks/useSessionBootstrap.ts
• frontend/src/hooks/useSessionBootstrap.test.tsx
• frontend/src/hooks/useGoogleLogin.ts
• frontend/src/hooks/useAdminSession.ts
• frontend/src/pages/Login/useLoginForm.ts
• frontend/src/pages/Login/LoginPage.test.tsx
• frontend/src/pages/Admin/useAdminLoginForm.ts
• frontend/src/pages/Dashboard/DashboardPage.tsx
• frontend/src/components/Navbar.tsx
• frontend/src/components/auth/AuthLoginPanel.tsx
• frontend/vite.config.ts
• frontend/.env.example
• frontend/nginx.conf
• frontend/src/test/test-utils.ts
• PROJECT_STATUS.md
Database Changes:
• None (SimpleJWT blacklist tables unchanged)
API Endpoints Added, Modified, or Removed:
• POST /api/auth/login/ — optional remember_me; response {access,user} + Set-Cookie refresh (no refresh in JSON)
• POST /api/auth/google/ — same cookie pattern; optional remember_me
• POST /api/auth/admin/login/ — same cookie pattern
• POST /api/auth/token/refresh/ — cookie-only input; response {access} + rotated Set-Cookie
• POST /api/auth/logout/ — cookie blacklist + clear (AllowAny with cookie; no JSON refresh)
• POST /api/auth/change-password/ and password-reset/confirm/ — clear refresh cookie on success
Frontend Pages Created/Updated:
• Login remember label (7 days); auth store / axios / bootstrap / logout call sites
Problems Encountered:
• Local cross-origin Vite→Django blocked SameSite=Lax cookies — resolved with Vite `/api` proxy + empty VITE_API_BASE_URL
Security Review:
• Refresh not readable by JS; access not in localStorage; CORS credentials + allowlist; RBAC still server-side; rotate/blacklist kept; SPA CSP added
Tests:
• Backend AuthenticationAPITests + google/admin/password-reset auth cases OK
• Frontend auth/bootstrap/login/navbar suites (run as part of finish)
Next Development Task:
• Sprint 11 formal E2E / deployment verification with cookie sessions
Date: 2026-09-17 (Sentry production monitoring)
Working Hours:
Today's Objective: Integrate Sentry for Django and the Vite/React app with PII scrubbing and webhook failure visibility.
Modules Completed: Backend sentry init/scrubber; Stripe webhook Sentry capture; frontend Sentry init + logger bridge; env/Compose wiring
Files Created:
• backend/config/sentry.py
• backend/config/test_sentry.py
• frontend/src/lib/sentry.ts
• frontend/src/lib/sentry.test.ts
• frontend/src/lib/logger.test.ts
Files Modified:
• backend/requirements.txt
• backend/config/settings.py
• backend/payments/views.py
• backend/.env.example
• frontend/package.json
• frontend/package-lock.json
• frontend/src/main.tsx
• frontend/src/lib/logger.ts
• frontend/src/components/ErrorBoundary.tsx
• frontend/src/components/ErrorBoundary.test.tsx
• frontend/.env.example
• frontend/Dockerfile
• .env.example
• docker-compose.yml
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• POST /api/payments/webhook/ — still same contract; handler exceptions now return 500 and report to Sentry (Stripe can retry)
Frontend Pages Created/Updated:
• None (infra: main.tsx, logger, ErrorBoundary)
Problems Encountered:
• Sentry MCP auth declined — DSNs and alert rules must be configured manually in sentry.io
Security Review:
• send_default_pii=False; request bodies never attached; Authorization/Cookie/token/password/email scrubbed
• Frontend DSN is public by design; no secrets in SPA env beyond the DSN
• Webhook signature verification unchanged; only reporting/tagging added
Tests:
• config.test_sentry + payments webhook reporting cases; frontend logger/sentry/ErrorBoundary suites
Next Development Task:
• Create Sentry projects, paste DSNs into env, configure webhook + 5xx alert rules (see agent handoff)
Date: 2026-09-17 (Celery async email)
Working Hours:
Today's Objective: Move non-critical email off the request path with Celery + Redis; keep Stripe fulfillment in-process and idempotent.
Modules Completed: Celery app; email tasks with retries; Compose worker; enqueue-after-commit helpers
Files Created:
• backend/config/celery.py
• backend/config/celery_utils.py
• backend/config/test_celery.py
• backend/orders/tasks.py
• backend/custom_projects/tasks.py
• backend/contact/tasks.py
• backend/accounts/tasks.py
Files Modified:
• backend/config/__init__.py
• backend/config/settings.py
• backend/requirements.txt
• backend/orders/notifications.py
• backend/custom_projects/notifications.py
• backend/contact/services.py
• backend/accounts/services.py
• backend/payments/services.py
• docker-compose.yml
• .env.example
• backend/.env.example
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None (behavior only: emails async)
Frontend Pages Created/Updated:
• None
Problems Encountered:
• Django TestCase never fires on_commit; eager mode runs tasks immediately for tests/local-without-Redis
Security Review:
• Stripe webhook signature verification unchanged
• Auth reset/verification tokens rebuilt in worker (user_id only on the queue)
• Enqueue/broker failures fail-soft; never block webhook fulfillment
• No secrets in email bodies or task payloads beyond user/order/project IDs
Tests:
• config.test_celery, contact, StripeWebhookTests, password-reset email, CustomProjectMessageEmailNotificationTests — OK
Next Development Task:
• Sprint 11 formal security / E2E / production deployment
Date: 2026-09-17 (Feature 13 — Docker / Gunicorn / Nginx)
Working Hours:
Today's Objective: Ship a reproducible full-stack Compose runtime with production images (DEBUG=False) and /api/healthz/ health checks.
Modules Completed: Backend Dockerfile + Gunicorn entrypoint; frontend Nginx SPA image; Compose web/postgres/redis/meilisearch/frontend; env templates; WhiteNoise static serving
Files Created:
• backend/Dockerfile
• backend/entrypoint.sh
• backend/.dockerignore
• frontend/Dockerfile
• frontend/nginx.conf
• frontend/.dockerignore
• frontend/public/_redirects
• .env.example
Files Modified:
• docker-compose.yml
• backend/requirements.txt
• backend/config/settings.py
• backend/config/test_health.py
• backend/.env.example
• frontend/.env.example
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None (reused GET /api/healthz/ for container health checks)
Frontend Pages Created/Updated:
• None (static hosting via Nginx / Cloudflare Pages `_redirects` only)
Problems Encountered:
• Local Docker Desktop daemon was unavailable for an end-to-end `compose up` smoke test
• Local Postgres password auth blocked full APITestCase healthz run on this machine
Solutions Implemented:
• Compose validates with required secrets via env; settings accept OS env without backend/.env; WhiteNoise after SecurityMiddleware
Lessons Learned:
• Keep image DEBUG=False and force secrets through Compose environment so local and prod share one stack
Next Development Task:
• Sprint 11 formal security testing, browser E2E, and production deployment sign-off
Date: 2026-09-16 (Sprint 11 — Performance + security hardening)
Working Hours:
Today's Objective: Optimise production codebase safely; fix entitlement gap; reduce duplicate fetches and N+1 queries.
Modules Completed: TanStack Query defaults/shared keys; public catalog SQL defer; order-detail file batching; review entitlement alignment; ModelViewer GPU cleanup
Files Created:
• None
Files Modified:
• frontend/src/main.tsx
• frontend/src/hooks/useCart.ts
• frontend/src/hooks/useBuyNow.ts
• frontend/src/components/Navbar.tsx
• frontend/src/components/viewer/ModelViewer.tsx
• frontend/src/pages/Models/ModelsBrowsePage.tsx
• frontend/src/pages/Plugins/PluginsBrowsePage.tsx
• frontend/src/pages/Products/ProductsBrowsePage.tsx
• frontend/src/pages/Dashboard/DashboardPage.tsx
• frontend/src/pages/Dashboard/DashboardPage.test.tsx
• backend/products/services.py
• backend/plugins/services.py
• backend/reviews/services.py
• backend/reviews/test_reviews.py
• backend/downloads/services.py
• backend/orders/views.py
• backend/orders/serializers.py
• backend/config/settings.py
• backend/.env.example
• backend/coupons/models.py
• PROJECT_STATUS.md
Database Changes:
• None (CONN_MAX_AGE setting only; no migrations)
API Endpoints Added:
• None
Frontend Pages Created:
• None
Problems Encountered:
• useGLTF.clear on unmount conflicts with intentional shared-cache design (Suspense remounts) — skipped after existing test guard
Solutions Implemented:
• Reused `orders.entitlements.user_owns_catalog_item` for reviews; batched `DownloadService.list_downloadable_files_for_items` for order detail
Lessons Learned:
• Align all purchase gates on one entitlement helper; prefer shared React Query keys over parallel fetches of the same endpoint
Next Development Task:
• Sprint 11 formal security testing, browser E2E, and production deployment sign-off
Date: 2026-09-10 (Phase 1 — Team & product stability)
Working Hours:
Today's Objective: Teammate login/verify DX; complete backend/.env.example; Feature 16 Phases 9–10; protect auth/checkout/download with tests.
Modules Completed: Console verification link; verify_email command; Django admin + SPA email_verified; .env.example; import→QA→pay→download E2E; R2 retries; batch public media; leftover media migration command
Files Created:
• backend/accounts/management/__init__.py
• backend/accounts/management/commands/__init__.py
• backend/accounts/management/commands/verify_email.py
• backend/products/management/__init__.py
• backend/products/management/commands/__init__.py
• backend/products/management/commands/migrate_local_media_to_r2.py
• backend/config/media_migration.py
• backend/products/test_catalog_commerce_e2e.py
• backend/products/test_media_migration.py
Files Modified:
• backend/.env.example
• frontend/.env.example
• backend/accounts/services.py
• backend/accounts/admin.py
• backend/accounts/admin_user_service.py
• backend/accounts/serializers.py
• backend/accounts/views.py
• backend/accounts/test_email_verification.py
• backend/accounts/test_admin_users.py
• backend/config/settings.py
• backend/config/media.py
• backend/config/storages.py
• backend/downloads/services.py
• backend/products/test_storage.py
• frontend/src/types/auth.ts
• frontend/src/pages/Admin/AdminUserDetailPage.tsx
• frontend/src/pages/Admin/AdminUsersPage.tsx
• frontend/src/components/auth/AuthRegisterPanel.tsx
• frontend/src/components/auth/AuthModal.test.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints:
• PATCH /api/admin/users/:id/ — accepts email_verified (existing route)
Frontend Pages/Components Added:
• Admin users list Verified column; user detail Email verification select; register success local-dev hint
Tests Added/Updated:
• Email verification DEBUG log + verify_email command + no token log when DEBUG=False
• Admin PATCH email_verified
• Feature 16 Phase 9 E2E (import → QA → checkout → webhook → download)
• Batch public media paths; R2 retry helper; leftover media migration
• Existing catalog import/QA/checkout/download suites still pass (100 targeted backend tests)
Security Checklist:
• Verification URLs logged only when DEBUG=True
• Emails redacted in security logs; tokens not logged in production
• package.zip under models/{SKU}/ remains private
• Webhook still signature-verified; downloads still entitlement-gated
• migrate_local_media_to_r2 refuses to run unless R2_ENABLED
Issues / Blockers:
• Live Stripe sandbox checkout not exercised in this session (API E2E mocks Stripe)
• Redis still required only when DEBUG=False
Next Recommended Task:
• Feature 13 — Docker (local/prod compose, Gunicorn, env templates)
Notes:
• Coworker local verify: copy EMAIL VERIFICATION LINK from runserver, or `python manage.py verify_email you@example.com`, or Django admin / SPA admin.
• Keep FRONTEND_BASE_URL aligned with the Vite origin (localhost vs 127.0.0.1).

Date: 2026-09-07 (Feature 16 Phase 7 — Admin import QA queue UI)
Working Hours:
Today's Objective: Ship simple admin UI to filter pending_review / import_batch_id and Approve / Reject / Requeue imported products.
Modules Completed: Admin products list filters + QA queue shortcut; detail QA action panel; API helpers; Vitest
Files Created:
• frontend/src/api/productsApi.test.ts
Files Modified:
• frontend/src/types/product.ts
• frontend/src/api/productsApi.ts
• frontend/src/pages/Admin/AdminProductsPage.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.tsx
• frontend/src/pages/Admin/AdminProductsPage.test.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.test.tsx
• frontend/src/config/adminNav.ts
• frontend/src/layouts/AdminLayout.tsx
• frontend/src/lib/apiError.ts
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints:
• Uses existing POST /api/admin/products/<uuid>/approve|reject|requeue/
Frontend Pages/Components Added:
• QA queue nav + Products list filters; Import QA panel on product detail
Tests Added/Updated:
• productsApi QA helpers; AdminProductsPage batch/status filters; AdminProductDetailPage approve/reject/requeue
Security Checklist:
• Reject reason only on admin detail; approve uses dedicated endpoint (not PATCH published)
Issues / Blockers:
• None for Phase 7 UI
Next Recommended Task:
• Feature 16 Phase 9 — E2E import → QA → Stripe → signed download
Notes:
• Phase 5 local R2 ingest treated as done; desktop catalog-bridge .exe polish remains separate.

Date: 2026-09-07 (Feature 16 Phase 8 — QA approve / reject → publish)
Working Hours:
Today's Objective: Finish backend QA publish gate — approve/reject/requeue with publish-ready validation; keep import non-publishing.
Modules Completed: Product QA metadata fields; ProductService.approve/reject/requeue + publish gates; admin POST endpoints; tests
Files Created:
• backend/products/migrations/0006_product_qa_review_metadata.py
• backend/products/test_product_qa.py
Files Modified:
• backend/products/models.py
• backend/products/services.py
• backend/products/serializers.py
• backend/products/views.py
• backend/products/urls.py
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• products.Product: reject_reason, qa_notes, reviewed_at, reviewed_by (FK SET_NULL)
API Endpoints:
• POST /api/admin/products/<uuid>/approve/ — pending_review → published (publish gates); clears reject_reason
• POST /api/admin/products/<uuid>/reject/ — body {reason, qa_notes?}; pending_review → rejected
• POST /api/admin/products/<uuid>/requeue/ — rejected → pending_review (keeps reject_reason)
Frontend Pages/Components Added:
• None (Phase 7 QA UI still pending)
Tests Added/Updated:
• products.test_product_qa: import→approve→public; reject+hidden; gate failures; non-admin 403; invalid transitions; requeue→approve; manual publish path; public omits QA fields
Security Checklist:
• IsAdministrator + JWT; never expose reject_reason/reviewed_by on public serializers
• Import still never sets published; imported rows must use approve (not PATCH status)
• log_admin_action product_approve / product_reject / product_requeue
Issues / Blockers:
• Phase 7 Admin import review UI still pending
Next Recommended Task:
• Feature 16 Phase 7 — Admin import review UI (batch filter / QA queue)
Notes:
• On approve: reject_reason cleared; qa_notes retained. On requeue: reject_reason kept until next reject/approve.

Date: 2026-09-03 (Feature 16 Phase 6 — Catalog Import API)
Working Hours:
Today's Objective: Add administrator JSON Catalog Import API that upserts products by Model_ID/SKU as pending_review after R2 upload (no auto-publish).
Modules Completed: CatalogImportService (gate + upsert + media pointers); POST /api/admin/products/import/; envelope serializers; admin audit log
Files Created:
• backend/products/catalog_import.py
• backend/products/test_catalog_import.py
Files Modified:
• backend/products/serializers.py
• backend/products/views.py
• backend/products/urls.py
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints:
• POST /api/admin/products/import/ — batch upsert; 200 with per-row created/updated/skipped/failed; 401/403/400 for auth/envelope
Frontend Pages/Components Added:
• None (Phase 7 QA UI later)
Tests Added/Updated:
• products.test_catalog_import: auth, happy create, re-import update, mismatch/gate skips, published/archived skip, category unmapped, public exclusion, path traversal, rejected→pending_review, storage_path omitted on public detail
• Related products.test_products + catalog import: 40 tests OK
Security Checklist:
• IsAdministrator + JWT; AdminProductWriteRateThrottle; no bridge role trust
• Object keys validated via media_relative_path (reject .. / absolute); package never on public URL fields
• Never sets status=published; pending_review excluded from public browse
• log_admin_action(catalog_import); no secrets in responses/logs
Issues / Blockers:
• Phase 5 catalog-bridge (separate repo) still needed to upload R2 + call this API
• Phase 7–8 admin QA queue / publish UI still pending
Next Recommended Task:
• Feature 16 Phase 7 — Admin import review UI (batch filter / QA queue)
Notes:
• Website import status is pending_review (Phase 6); contract §F draft wording superseded for this API only — gate columns unchanged

Date: 2026-09-03 (Feature 14B — Signed R2 download URLs)
Working Hours:
Today's Objective: Replace Django FileResponse proxy for private R2 catalog packages with entitlement-gated presigned GET JSON.
Modules Completed: Private-bucket presign helper; DownloadService signed vs stream delivery; frontend JSON/blob download client
Files Created:
• None
Files Modified:
• backend/config/storages.py
• backend/config/settings.py
• backend/.env.example
• backend/downloads/services.py
• backend/downloads/views.py
• backend/downloads/serializers.py
• backend/downloads/test_downloads.py
• backend/products/test_storage.py
• frontend/src/api/downloadsApi.ts
• frontend/src/api/downloadsApi.test.ts
• frontend/src/types/download.ts
• IMPLEMENTATION_ROADMAP.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints:
• GET /api/downloads/products/<id>/files/<id>/download/ — JSON { download_url, expires_in, file_name } when the private R2 object exists; FileResponse otherwise
• GET /api/downloads/plugins/<id>/files/<id>/download/ — same dual response
Frontend Pages/Components Added:
• None — My Downloads and order detail reuse downloadCatalogFile / downloadCatalogFileByUrl
Tests Added/Updated:
• downloads API: signed JSON (product + plugin), local fallback, missing file without history, non-owner 404 with R2 on
• storage helpers: expiry clamp, Content-Disposition sanitization, boto3 presign params
• downloadsApi.ts: blob path, signed JSON path, javascript: URL rejection
Security Checklist:
• Entitlement (paid order + paid payment) still required; unauthenticated 401; non-owner 404
• DownloadRateThrottle unchanged (30/min)
• storage_path never returned; entitlements still use API download paths
• Presigned URL expiry clamped 60–3600s (default 300); Content-Disposition filename sanitized
• Frontend only follows http(s) signed URLs
• Signed URLs are not written to logs
Issues / Blockers:
• Custom-project / delivery / message attachment signed URLs remain out of scope
• Live R2 E2E (Stripe pay → browser download from private bucket) needs R2_* in backend/.env
Next Recommended Task:
• Feature 16 Phase 7 — Admin import review UI (batch filter / QA queue)
Notes:
• Local/CI remain FileResponse because tests force R2_ENABLED off unless overridden

Date: 2026-09-01 (Feature 14 — Cloudflare R2 foundation)
Working Hours:
Today's Objective: Wire Django to 3dam-public and 3dam-private with local MEDIA fallback when R2 env is unset.
Modules Completed: Dual named storages; public CDN URLs for images/previews/avatars; private object keys for packages and custom-project files; FileResponse still used for entitled downloads
Files Created:
• backend/config/storages.py
• backend/config/validators.py
• backend/products/test_storage.py
• backend/.env.example
• backend/products/migrations/0005_productfile_storage_path_charfield.py
• backend/plugins/migrations/0004_pluginfile_storage_path_charfield.py
• backend/custom_projects/migrations/0008_storage_path_charfield.py
Files Modified:
• backend/config/settings.py
• backend/config/media.py
• backend/products/storage.py
• backend/accounts/storage.py
• backend/products/models.py
• backend/plugins/models.py
• backend/custom_projects/models.py
• backend/requirements.txt
• docs/PLANNED_FEATURES.md
• PROJECT_STATUS.md
Database Changes:
• storage_path URLField → CharField(max_length=512) on product_files, plugin_files, custom project file/delivery/attachment tables
API Endpoints:
• None added — existing upload/download routes now persist to R2 when configured
Frontend Pages/Components Added:
• None
Tests Added/Updated:
• products/test_storage.py — public vs private routing, R2 URL builder, open_stored_file
• Download and custom-project tests resolve stored keys without requiring /media/ URLs
Security Checklist:
• Paid packages never written to R2_PUBLIC_BASE_URL
• storage_path still omitted from public APIs
• R2 credentials only in env; .env.example has empty placeholders
• Path traversal rejected on storage_path and media_relative_path
Issues / Blockers:
• Set R2_* in backend/.env to use live buckets; Feature 14B still needed for presigned downloads
Next Recommended Task:
• Feature 14B — signed download URLs for private R2 objects
Notes:
• CI/tests keep filesystem storage because R2 env is unset

Date: 2026-08-06 (Browse Models page — wireframe hub UI)
Working Hours:
Today's Objective: Update /products (Browse Models) UI to match the approved discovery wireframe while keeping catalog deep-links.
Modules Completed: ProductsBrowsePage hub layout (hero, module CTAs, trending categories, shop models rail, plugins rail); catalog mode for ?search= / ?category= / ?view=all; light brand-token restyle of products-browse.css (shared ProductCard/PluginCard)
Files Created:
• None
Files Modified:
• frontend/src/pages/Products/ProductsBrowsePage.tsx
• frontend/src/pages/Products/ProductsBrowsePage.test.tsx
• frontend/src/styles/products-browse.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints:
• None added — reused listPublicProducts, listPublicCategories, listPublicPlugins
Frontend Pages/Components Added:
• Hub sections on ProductsBrowsePage; CategoryTile inline; catalog mode retained for filters/pagination
Tests Added/Updated:
• ProductsBrowsePage.test.tsx — 8/8 passing (hub render, catalog entry, filters, URL search/category, empty, wishlist)
Security Checklist:
• Public list endpoints only; React text binding for names/descriptions; no HTML injection
• Search maxLength 100; category filter uses IDs already validated server-side
• No secrets, storage paths, or admin fields exposed
Issues / Blockers:
• None
Next Recommended Task:
• Align Navbar labels/search with wireframe header if desired; otherwise Feature 16 Phase 8 / Docker / R2 when ready
Notes:
• Default /products is discovery hub; full filter catalog opens via View All, Shop 3D models, search, or category

Date: 2026-08-05 (Feature 14/14B — R2 integration plan saved; no code)
Working Hours:
Today's Objective: Capture Cloudflare R2 website integration plan in IMPLEMENTATION_ROADMAP.md without building yet.
Modules Completed: Recreated IMPLEMENTATION_ROADMAP.md with Feature 14 + 14B phases (dashboard setup, dual buckets, django-storages, entitled presigned GET, E2E); Feature 16 summary retained with link to batch-ingest contract
Files Created:
• IMPLEMENTATION_ROADMAP.md
Files Modified:
• PROJECT_STATUS.md (Sprint 10 / pending / blockers / this log)
Database Changes:
• None
API Endpoints:
• None
Issues / Blockers:
• Coding deferred until Phase 0 (buckets, API token, public URL, CORS, .env) and explicit build kickoff
Next Recommended Task:
• Phase 0 Cloudflare dashboard setup, then implement Feature 14 → 14B per IMPLEMENTATION_ROADMAP.md
Notes:
• Stripe pay → entitlement path already exists; plan only swaps local MEDIA / FileResponse for R2 public CDN + private presigned GET
• Batch ingest (Feature 16 Phase 5+) still after 14/14B

Date: 2026-08-05 (Global product search — navbar + browse URL sync)
Working Hours:
Today's Objective: Add a site-wide product search bar without duplicating catalog search APIs.
Modules Completed: ProductSearchForm, Navbar search, ProductsBrowsePage ?search= sync, tests, status update
Files Created:
• frontend/src/components/ProductSearchForm.tsx
• frontend/src/components/ProductSearchForm.test.tsx
Files Modified:
• frontend/src/components/Navbar.tsx (+ test)
• frontend/src/styles/navbar.css
• frontend/src/pages/Products/ProductsBrowsePage.tsx (+ test)
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints:
• None added/removed — reused GET /api/products/?search=
Frontend Pages/Components Added:
• ProductSearchForm (navbar); browse page search stays and syncs with URL
Tests Added/Updated:
• ProductSearchForm (2), Navbar search nav (1), ProductsBrowsePage URL search (1) — 16 related tests pass
Security Checklist:
• Search is plain text query only; maxLength 100; no HTML injection (React text/input binding)
• Public list remains published-only via existing ProductService.list_public
• No secrets, storage paths, or admin fields exposed
Issues / Blockers:
• None
Next Recommended Task:
• Feature 16 Phase 8 remaining QA queue UI, or Feature 13 Docker / Feature 14 R2 when access ready
Notes:
• Browse hero search and navbar search both drive the same public catalog endpoint

Date: 2026-08-04 (Feature 16 Phase 4 — Freeze batch + intake contracts)
Working Hours:
Today's Objective: Lock Batch Output Report + Phase 1 intake schema, folder layout, R2 keys, and ready-to-import gate before bridge coding.
Modules Completed: Contract doc, sample fixtures (happy / mismatch / gate-failures), roadmap + status sync
Files Created:
• docs/batch-ingest-contract.md
• docs/fixtures/batch-ingest/README.md
• docs/fixtures/batch-ingest/happy/ (CSV + folder-tree + README)
• docs/fixtures/batch-ingest/mismatch/ (CSV + folder-tree + README)
• docs/fixtures/batch-ingest/gate-failures/ (CSV + folder-tree + README)
Files Modified:
• IMPLEMENTATION_ROADMAP.md (Phase 4 ✅; Input contracts aligned; decisions locked)
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints:
• None
Frontend Pages/Components Added:
• None (docs-only phase)
Tests Added/Updated:
• Fixture CSVs for future Phase 5/6 parser tests (not executable unit tests yet)
Security Checklist:
• No secrets; fixture paths are local examples only
• Contract reaffirms never auto-publish; private packages stay private R2 later
Issues / Blockers:
• Live intake Excel sign-off still pending for proposed Thumbnail Path / Gallery / Tags column names
• Cloudflare R2 still blocked on company account setup (Phases 5–6, 9)
Next Recommended Task:
• Feature 16 Phase 8 — QA approve/reject statuses (while R2 pending), or Phase 5 bridge when R2 is ready
Notes:
• Required exports locked: GLB + ≥1 of FBX/OBJ/MAX; R2 prefix models/{Model_ID}/

Date: 2026-08-04 (Feature 16 Phase 3 — Product SKU / Model_ID identity)
Working Hours:
Today's Objective: Add stable Product.sku (Model_ID) and import metadata so batch upsert can join without duplicates.
Modules Completed: Product identity fields, admin API create/update/filter/search by SKU, admin UI SKU fields, tests
Files Created:
• backend/products/migrations/0003_product_sku_and_import_identity.py
Files Modified:
• backend/products/models.py, services.py, serializers.py, views.py, admin.py, test_products.py
• frontend/src/types/product.ts
• frontend/src/pages/Admin/AdminProductsPage.tsx (+ test)
• frontend/src/pages/Admin/AdminProductDetailPage.tsx (+ test)
• frontend/src/pages/Admin/ProductMediaSection.test.tsx, AdminOrdersPage.test.tsx
• IMPLEMENTATION_ROADMAP.md, PROJECT_STATUS.md
Database Changes:
• products.sku (unique nullable indexed CharField)
• products.import_batch_id, import_source, glb_checksum
• products.has_thumbnail, has_preview, has_package
• indexes on sku and import_batch_id
API Endpoints:
• GET /api/admin/products/ — added query params sku, import_batch_id; search includes sku [modified]
• POST /api/admin/products/ — accepts sku + import metadata [modified]
• PATCH /api/admin/products/<uuid>/ — set/clear sku + import metadata [modified]
• No endpoints added or removed
Frontend Pages/Components Added:
• Admin products list: SKU column + create SKU field
• Admin product detail: SKU, import batch ID, GLB checksum fields
Tests Added/Updated:
• backend products.test_products — 7 new SKU tests (24/24 suite pass)
• frontend AdminProductsPage / AdminProductDetailPage / ProductMediaSection / AdminOrdersPage mocks updated
Security Checklist:
• Admin-only product write/list filters (IsAdministrator + throttle unchanged)
• SKU format validated server-side; uniqueness enforced
• Public product serializers do not expose sku / import metadata / checksum
• No secrets or storage paths exposed
Issues / Blockers:
• Phase 1 intake Excel still needed to freeze Feature 16 Phase 4 contract
• Cloudflare R2 still blocked on company account setup (Phases 5–6, 9)
Next Recommended Task:
• Feature 16 Phase 4 — freeze Batch Output Report + Phase 1 intake contracts (or Phase 8 QA statuses)
Notes:
• Idempotent re-import: ProductService.get_by_sku; blank SKU → null so many manual products can omit Model_ID

Date: 2026-08-03 (Feature 15G — Quotation payment)
Working Hours:
Today's Objective: Enable Stripe payment for accepted custom-project quotations.
Modules Completed: OrderItem custom_project type, create_from_quotation, quotation checkout + webhook fulfillment, customer Pay UI, tests
Files Created:
• backend/orders/migrations/0003_orderitem_custom_project_type.py
• backend/payments/test_quotation_payments.py
Files Modified:
• backend/orders/models.py, services.py, serializers.py
• backend/payments/services.py
• backend/custom_projects/services.py, views.py, urls.py
• frontend/src/api/customProjectsApi.ts, types/payment.ts
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx (+ test)
• frontend/src/pages/Checkout/CheckoutSuccessPage.tsx, CheckoutCancelPage.tsx
• PROJECT_STATUS.md
Database Changes:
• OrderItem.product_type choices include custom_project
API Endpoints:
• POST /api/custom-projects/<uuid>/quotation/pay/ — start Stripe Checkout (or free fulfill) [added]
Frontend Pages/Components Added:
• Pay quotation / Continue payment on customer project detail
• Checkout success/cancel aware of project_id for quotation flow
Tests Added/Updated:
• backend payments.test_quotation_payments (8)
• frontend CustomerProjectDetailPage pay-button tests
Security Checklist:
• Owner-only pay endpoint (other customers → 404)
• PaymentCheckoutRateThrottle
• Accepted quotation + unpaid/pending required; already paid rejected
• Webhook idempotent; expiry reverts project payment_status pending → unpaid
• OrderItem can_download false for custom_project lines
Issues / Blockers:
• None (R2 still pending company account setup)
Next Recommended Task:
• Feature 16 Phase 3–4 (SKU + batch contracts) or Feature 13 Docker / Feature 12 polish while waiting on R2
Notes:
• Reuses existing Payment↔Order model; quotation amount snapshotted on OrderItem

Date: 2026-08-03 (Roadmap — R2 + Batch Ingest + QA)
Working Hours:
Today's Objective: Capture batch-render → R2 → admin QA → Stripe download plan in project docs.
Modules Completed: Planning only (no code)
Files Created:
• IMPLEMENTATION_ROADMAP.md (10 phases, Batch Output Report contract, Cloudflare setup, Feature 14/14B/16 mapping)
Files Modified:
• PROJECT_MASTER_PLAN.md (R2 selected; Stage 11 cloud/batch; success criteria; admin QA role)
• PROJECT_STATUS.md (Sprint 10 cloud/batch checklist; pending features; decisions; debt)
Database Changes:
• None
API Endpoints:
• None
Frontend Pages/Components Added:
• None
Tests Added/Updated:
• None
Security Checklist:
• Documented: private R2 never public; entitlement before signed GET; no auto-publish from bridge
Issues / Blockers:
• Need Phase 1 intake Excel to freeze price/thumbnail/description columns
Next Recommended Task:
• Feature 14 — Cloudflare R2 storage foundation (then Feature 14B signed downloads)
Notes:
• Batch Output Report template already defines Model_ID, export statuses, GLB checksum, R2 Key Prefix, QA Status lifecycle
• v1 bridge = Python CLI; Worker/Queue optional in Phase 10

Date: 2026-08-03 (Feature 10 — In-app Notifications)
Working Hours:
Today's Objective: DB-backed in-app notifications with workflow emits and customer bell UI.
Modules Completed: notifications app, APIs, event hooks, NotificationBell, NotificationsPage, tests, PROJECT_STATUS
Files Created:
• backend/notifications/ (models, services, serializers, views, urls, pagination, apps, migrations/0001_initial, test_notifications)
• frontend/src/types/notification.ts
• frontend/src/api/notificationsApi.ts
• frontend/src/components/NotificationBell.tsx (+ test)
• frontend/src/pages/Dashboard/NotificationsPage.tsx (+ test)
Files Modified:
• backend/config/settings.py, urls.py
• backend/accounts/throttles.py
• backend/custom_projects/services.py
• backend/orders/services.py
• frontend/src/App.tsx, components/Navbar.tsx (+ test), pages/Dashboard/DashboardPage.tsx
• frontend/src/styles/navbar.css
• PROJECT_STATUS.md
Database Changes:
• New table `notifications` (UUID PK, user FK, title, message, link, is_read, created_at, updated_at)
API Endpoints:
• GET /api/notifications/ — paginated list (is_read, ordering) [added]
• GET /api/notifications/unread-count/ [added]
• POST /api/notifications/<uuid>/read/ — mark one read (owner-only; 404 otherwise) [added]
• POST /api/notifications/read-all/ [added]
Frontend Pages/Components Added:
• Navbar NotificationBell (dropdown + unread badge)
• /dashboard/notifications — NotificationsPage
• Dashboard link to notifications
Tests Added/Updated:
• backend notifications.test_notifications (12)
• frontend NotificationBell (4), NotificationsPage (3), Navbar notifications control
Security Checklist:
• Authenticated only; owner-scoped list/mark (IDOR → 404)
• Write endpoints throttled (notification_write 60/min)
• Bodies kept short; no quote amounts, message bodies, storage paths, or secrets
• Frontend only navigates safe relative links (starts with /)
• Emit helpers fail-soft and never roll back business writes
Issues / Blockers:
• None
Next Recommended Task:
• Feature 12 polish / Feature 13 Docker / Feature 15G quotation payment / Feature 14 R2
Notes:
• Celery not required for v1; creates are synchronous DB inserts
• Assigned designer receives in-app notice for customer project messages; customers receive quotation/message/delivery/order notices

Date: 2026-08-03 (Feature 11 — Admin Analytics)
Working Hours:
Today's Objective: Replace sales placeholders with order-based admin analytics (API + /admin/analytics UI).
Modules Completed: AnalyticsService, admin analytics API, real dashboard monthly sales, AdminAnalyticsPage, nav enable, tests, PROJECT_STATUS
Files Created:
• backend/analytics/analytics_urls.py
• backend/analytics/test_analytics.py
• frontend/src/types/analytics.ts
• frontend/src/api/analyticsApi.ts
• frontend/src/pages/Admin/AdminAnalyticsPage.tsx
• frontend/src/pages/Admin/AdminAnalyticsPage.test.tsx
Files Modified:
• backend/analytics/services.py, serializers.py, views.py, admin_urls.py
• backend/config/urls.py
• frontend/src/App.tsx, config/adminNav.ts
• frontend/src/layouts/AdminLayout.test.tsx
• PROJECT_STATUS.md
Database Changes:
• None (compute-on-read from orders / order_items / payments)
API Endpoints:
• GET /api/admin/analytics/ — order analytics + date filters (admin-only) [added]
• GET /api/admin/dashboard/stats/ — sales.monthly_* now from paid orders [modified]
Frontend Pages/Components Added:
• /admin/analytics — AdminAnalyticsPage (summary cards, period table, top products/plugins, gateway breakdown)
• Admin sidebar Analytics link enabled
Tests Added/Updated:
• backend analytics.test_analytics + existing dashboard stats (7 analytics-related tests)
• frontend AdminAnalyticsPage (4) + AdminLayout analytics nav
Security Checklist:
• Admin-only RBAC (IsAuthenticated + IsAdministrator); customer/guest denied
• Date filters validated server-side; inverted/invalid/too-wide ranges → 400
• ORM aggregations only (no raw SQL); no secrets, storage paths, or PII dumps in response
• gateway_breakdown exposes gateway name + counts/amounts only (no Stripe secrets)
Issues / Blockers:
• None
Next Recommended Task:
• Feature 10 — In-app Notifications (or Feature 12 polish / Feature 13 Docker / Feature 15G quotation payment)
Notes:
• Default date range is current calendar month through today when start_date/end_date omitted
• Charts deferred (cards + tables satisfy Feature 11)

Date: 2026-07-31 (Feature 15F — Admin Payments UI)
Working Hours:
Today's Objective: Admin payments list/detail APIs + SPA so support/finance can inspect Stripe payments without digging through orders only.
Modules Completed: Admin payment list/detail APIs, Payments admin UI, dashboard paid count, tests, PROJECT_STATUS
Files Created:
• backend/payments/serializers.py
• backend/payments/pagination.py
• backend/payments/admin_urls.py
• backend/payments/test_admin_payments.py
• frontend/src/pages/Admin/AdminPaymentsPage.tsx (+ test)
• frontend/src/pages/Admin/AdminPaymentDetailPage.tsx (+ test)
• frontend/src/api/paymentsApi.test.ts
Files Modified:
• backend/payments/views.py, services.py
• backend/config/urls.py
• backend/analytics/services.py, serializers.py, test_dashboard_stats.py
• frontend/src/types/payment.ts, types/dashboard.ts
• frontend/src/api/paymentsApi.ts
• frontend/src/App.tsx, config/adminNav.ts
• frontend/src/pages/Admin/AdminDashboardPage.tsx (+ test)
• PROJECT_STATUS.md
Database Changes:
• None (reuses existing payments table)
API Endpoints:
• GET /api/admin/payments/ — list + filters (admin-only)
• GET /api/admin/payments/<uuid>/ — detail (admin-only)
• GET /api/admin/dashboard/stats/ — now includes payments.succeeded / payments.pending
Frontend Pages/Components Added:
• /admin/payments — AdminPaymentsPage
• /admin/payments/:paymentId — AdminPaymentDetailPage
• Admin sidebar Payments link; dashboard paid-payments card
Tests Added/Updated:
• backend payments.test_admin_payments — list/filter/detail + RBAC (6 tests)
• backend analytics dashboard payments counts
• frontend AdminPaymentsPage, AdminPaymentDetailPage, paymentsApi, AdminDashboardPage
Security Checklist:
• Admin-only RBAC (IsAdministrator); customer/guest denied
• No Stripe secret keys or card data exposed — session/intent IDs only
• Input validated for status/date filters; search parameterized via ORM
• Existing checkout/webhook behavior unchanged
Issues / Blockers:
• None
Next Recommended Task:
• Feature 10 — In-app Notifications (or Feature 11 Admin Analytics / Feature 15G quotation payment)
Notes:
• Payment model statuses remain pending/succeeded/failed/expired/refunded; UI labels map succeeded→Paid, expired→Cancelled; filters accept paid/cancelled aliases
• No dedicated payment status-history table; detail shows created_at/updated_at only

Date: 2026-07-31 (Feature 8 — Order integrity hardening)
Working Hours:
Today's Objective: Snapshot OrderItem title/slug; harden admin status UI; update PROJECT_STATUS after Stripe Phase 1.
Modules Completed: OrderItem snapshots, admin transition UI, serializer fallback, docs
Files Created:
• backend/orders/migrations/0002_orderitem_title_slug.py
Files Modified:
• backend/orders/models.py, services.py, serializers.py, views.py, test_orders.py
• backend/payments/services.py (prefer snapshotted titles for Stripe line items)
• frontend/src/types/order.ts
• frontend/src/pages/Admin/AdminOrderDetailPage.tsx (+ tests)
• frontend ordersApi / AdminOrdersPage / CustomerOrderDetailPage test fixtures
• DATABASE_STRUCTURE.md, docs/DatabaseDesign.md, PROJECT_STATUS.md
Database Changes:
• order_items.title (nullable CharField)
• order_items.slug (nullable SlugField)
• Backfill from live Product/Plugin for existing rows
API Endpoints:
• Unchanged routes; order detail item payload now includes slug; title prefers snapshot
Frontend Pages/Components Added:
• AdminOrderDetailPage — Status transitions section (allowed actions only)
Tests Added/Updated:
• backend orders.test_orders — snapshot persistence, rename immunity, fallback, admin PATCH transitions
• frontend AdminOrderDetailPage — transition buttons + slug display
Security Checklist:
• Admin status writes still IsAdministrator + AdminOrderWriteRateThrottle + log_admin_action
• Illegal transitions rejected 400 via OrderService maps
• Snapshots prevent catalog rename/delete from rewriting historical invoice titles
Issues / Blockers:
• None
Next Recommended Task:
• Feature 10 — In-app Notifications (per IMPLEMENTATION_ROADMAP.md)
Notes:
• Stripe Checkout Phase 1 already on develop; Feature 8 restores roadmap order before remaining Feature 15 work
• Feature 12 public pages and Feature 9 reviews already shipped earlier

Date: 2026-07-30 (Coupons / Discount codes)
Working Hours:
Today's Objective: Admin coupon CRUD + customer apply/remove on cart with server-side discounted totals (no Stripe).
Modules Completed: coupons Django app, cart coupon wiring, Admin coupons UI, CartPage/CartDrawer coupon form
Files Created:
• backend/coupons/ (models, services, serializers, views, admin_urls, pagination, admin, test_coupons.py, migration 0001)
• backend/cart/migrations/0002_cart_coupon.py
• frontend/src/types/coupon.ts
• frontend/src/api/adminCouponsApi.ts
• frontend/src/components/cart/CartCouponForm.tsx
• frontend/src/pages/Admin/AdminCouponsPage.tsx, AdminCouponDetailPage.tsx
Files Modified:
• backend/config/settings.py, urls.py; backend/accounts/throttles.py
• backend/cart/models.py, services.py, serializers.py, views.py, urls.py, test_cart.py
• frontend/src/types/cart.ts, api/cartApi.ts, api/cartApi.test.ts, hooks/useCart.ts
• frontend/src/pages/Cart/CartPage.tsx, CartPage.test.tsx
• frontend/src/components/cart/CartDrawer.tsx; styles/cart.css
• frontend/src/App.tsx, config/adminNav.ts
• frontend cart mocks in Navbar/ProductDetails/PluginDetails tests
• PROJECT_STATUS.md
Database Changes:
• coupons table (Coupon model)
• carts.coupon_id nullable FK → coupons
API Endpoints:
• GET/POST /api/admin/coupons/
• GET/PATCH/DELETE /api/admin/coupons/<uuid>/ (DELETE soft-deactivates; ?hard=true deletes unused)
• POST /api/cart/coupon/ — apply code
• DELETE /api/cart/coupon/ — remove applied coupon
• GET /api/cart/ — now includes discount_amount, total, coupon
Frontend Pages/Components Added:
• /admin/coupons — AdminCouponsPage
• /admin/coupons/:couponId — AdminCouponDetailPage
• CartCouponForm on CartPage + CartDrawer
Tests Added/Updated:
• backend/coupons/test_coupons.py + cart coupon tests — 27 passing
• frontend CartPage, cartApi tests updated/extended
Security Checklist:
• Admin-only coupon CRUD (IsAdministrator); customer 403
• Coupon apply/remove authenticated + CartWriteRateThrottle
• Discount never trusted from client; invalid codes use generic error
• Admin create/update/deactivate/delete logged via log_admin_action
• Coupon codes rendered as plain text (XSS-safe)
Issues / Blockers:
• None
Next Recommended Task:
• Feature 15 — Checkout + Stripe (charge cart.total; snapshot coupon; increment times_used)
Notes:
• max_uses_per_user is stored and editable; historical per-user redemption checks wait for order coupon linkage at checkout
• Catalog discount_price remains SKU-level; coupon is cart-level on top of effective prices

Date: 2026-07-30 (Secure Downloads + Download History)
Working Hours:
Today's Objective: Purchase-gated catalog downloads (local storage), download audit trail, customer library UI, order-detail download buttons.
Modules Completed: downloads app, orders/entitlements.py, customer + admin download APIs, MyDownloadsPage, AdminDownloadsPage, CustomerOrderDetailPage download wiring
Files Created:
• backend/downloads/ (models, services, views, urls, admin_urls, test_downloads.py, migration)
• backend/orders/entitlements.py
• frontend/src/api/downloadsApi.ts, downloadsApi.test.ts
• frontend/src/types/download.ts
• frontend/src/pages/Dashboard/MyDownloadsPage.tsx, MyDownloadsPage.test.tsx
• frontend/src/pages/Admin/AdminDownloadsPage.tsx
Files Modified:
• backend/config/settings.py, urls.py; backend/accounts/throttles.py
• backend/orders/serializers.py, views.py, test_orders.py
• frontend/src/types/order.ts, App.tsx, Navbar.tsx, Navbar.test.tsx
• frontend/src/pages/Dashboard/DashboardPage.tsx, CustomerOrderDetailPage.tsx, CustomerOrderDetailPage.test.tsx
• frontend/src/config/adminNav.ts
• DATABASE_STRUCTURE.md, docs/DatabaseDesign.md, PROJECT_STATUS.md
Database Changes:
• download_history table (DownloadHistory model)
API Endpoints:
• GET /api/downloads/entitlements/ — customer owned library
• GET /api/downloads/history/ — customer paginated audit
• GET /api/downloads/products/<uuid>/files/<uuid>/download/
• GET /api/downloads/plugins/<uuid>/files/<uuid>/download/
• GET /api/admin/downloads/history/ — admin paginated audit (email/type filters)
Frontend Pages/Components Added:
• /dashboard/downloads — MyDownloadsPage (library + history tabs)
• /admin/downloads — AdminDownloadsPage
• CustomerOrderDetailPage — enabled download buttons when order+payment paid
• Navbar + Dashboard "My downloads" links
Tests Added/Updated:
• backend/downloads/test_downloads.py — 17 tests
• frontend downloadsApi, MyDownloadsPage, CustomerOrderDetailPage, Navbar tests
Security Checklist:
• Entitlement: both order_status and payment_status must be paid; refunded/cancelled → 404
• IDOR-safe: non-owners get 404 (not 403)
• storage_path never exposed; download_url only via entitled APIs
• Private /media/products/files/ and /media/plugins/files/ remain 404 in DEBUG
• DownloadRateThrottle 30/min per user
Issues / Blockers:
• None
Next Recommended Task:
• Feature 15 — Checkout + Stripe (mark orders paid; download logic already works)
Notes:
• Signed CDN URLs explicitly deferred; swap DownloadService._stream_file when Cloudflare ships
• Manual test: admin marks order paid (both statuses), customer downloads from /dashboard/downloads or order detail

Date: 2026-07-29 (Feature 7 — Customer Order History complete)
Working Hours:
Today's Objective: Customer order history — Phase 1 backend APIs + Phase 2 dashboard UI (list, detail, navigation, tests).
Modules Completed: customer order APIs (backend), ordersApi client, MyOrdersPage, CustomerOrderDetailPage, navbar/dashboard links, OrderStatusBadge components
Files Created:
• frontend/src/pages/Dashboard/MyOrdersPage.tsx, MyOrdersPage.test.tsx
• frontend/src/pages/Dashboard/CustomerOrderDetailPage.tsx, CustomerOrderDetailPage.test.tsx
Files Modified:
• backend/orders/services.py, serializers.py, views.py, urls.py, test_orders.py (Phase 1)
• backend/config/urls.py (Phase 1)
• frontend/src/types/order.ts, api/ordersApi.ts, ordersApi.test.ts
• frontend/src/components/ui/StatusBadge.tsx, Navbar.tsx, Navbar.test.tsx
• frontend/src/pages/Dashboard/DashboardPage.tsx
• frontend/src/App.tsx
• PROJECT_STATUS.md
Database Changes:
• None (reuses existing Order / OrderItem models)
API Endpoints (customer):
• GET /api/orders/ — paginated list (auth; filters: order_status, payment_status, search, ordering)
• GET /api/orders/<uuid:order_id>/ — detail with line items (auth; IDOR → 404)
Frontend Pages/Components Added:
• /dashboard/orders — MyOrdersPage (table, filters, pagination, empty/loading/error)
• /dashboard/orders/:orderId — CustomerOrderDetailPage (summary, line items, download buttons when fully paid)
• OrderStatusBadge / OrderPaymentStatusBadge
• Navbar + Dashboard "My orders" links (customers only)
Tests Added/Updated:
• backend/orders/test_orders.py — OrderCustomerAPITests (45 tests total in orders app)
• frontend ordersApi, MyOrdersPage, CustomerOrderDetailPage, Navbar tests — 18 tests passing in touched frontend suite
Security Checklist:
• Owner-only API queryset; other users' order IDs → 404
• No customer_id or storage_path in responses; download_url only for entitled paid orders/downloads APIs
• Paid-order downloads via authenticated FileResponse (local storage); storage_path never exposed; requires order_status=paid AND payment_status=paid
• Queries enabled only for authenticated non-admin customers
Issues / Blockers:
• None
Next Recommended Task:
• Feature 8 — Order integrity hardening (title snapshots on OrderItem, admin status transitions)
Notes:
• Line item titles use live catalog lookup; Feature 8 will add OrderItem.title snapshots
• Manual test: sign in as customer, view orders created via /admin/orders for that account only

Date: 2026-07-29 (Feature 7 Phase 1 — Customer Order History backend)
Working Hours:
Today's Objective: Read-only customer order list and detail APIs — owner-scoped, paginated, filtered; no frontend UI in this phase.
Modules Completed: OrderService.list_for_user / get_for_user, customer serializers/views/urls, customer API tests
Files Created:
• backend/orders/urls.py
Files Modified:
• backend/orders/services.py, serializers.py, views.py, test_orders.py
• backend/config/urls.py
• PROJECT_STATUS.md
Database Changes:
• None (reuses existing Order / OrderItem models)
API Endpoints Added:
• GET /api/orders/ — paginated list of own orders (auth; filters: order_status, payment_status, search on invoice_number, ordering)
• GET /api/orders/<uuid:order_id>/ — own order detail with line items and live catalog titles (auth; IDOR → 404)
Frontend Pages/Components Added:
• None (Phase 1 backend only)
Tests Added/Updated:
• backend/orders/test_orders.py — OrderCustomerAPITests (14 tests: auth, ownership, pagination, filters, search, ordering, schema, live titles)
• Full orders suite: 45 tests passing
Security Checklist:
• Owner-only queryset via OrderService.list_for_user / get_for_user
• Other users' order IDs return 404 (not 403)
• Unauthenticated requests return 401
• No customer_id, user_id, storage_path, or download URLs in responses
• Admin /api/admin/orders/ routes unchanged (customers still 403)
Issues / Blockers:
• None
Next Recommended Task:
• Feature 7 Phase 2 — Customer order history UI (/dashboard/orders), or Feature 8 — Order integrity hardening (title snapshots)
Notes:
• Line item titles use live Product/Plugin name lookup (same as admin detail); Feature 8 will snapshot title on OrderItem with serializer fallback
• Administrators using customer endpoints see only orders where user=request.user (wishlist/cart convention)

Date: 2026-07-29 (Feature 6 — Shopping Cart)
Working Hours:
Today's Objective: Authenticated shopping cart for products and plugins — backend APIs, TanStack Query frontend, cart page + drawer, add-to-cart CTAs; no checkout/payments.
Modules Completed: backend cart app, cart APIs, useCart hook, CartPage, CartDrawer, navbar badge, product/plugin CTAs
Files Created:
• backend/cart/__init__.py, apps.py, models.py, services.py, serializers.py, views.py, urls.py, test_cart.py, migrations/0001_initial.py
• frontend/src/types/cart.ts
• frontend/src/api/cartApi.ts, cartApi.test.ts
• frontend/src/hooks/useCart.ts
• frontend/src/store/cartUiStore.ts
• frontend/src/components/cart/AddToCartButton.tsx, CartLineItem.tsx, CartDrawer.tsx
• frontend/src/pages/Cart/CartPage.tsx, CartPage.test.tsx
• frontend/src/styles/cart.css
Files Modified:
• backend/config/settings.py, backend/config/urls.py, backend/accounts/throttles.py
• frontend/src/App.tsx, Navbar.tsx, Navbar.test.tsx
• frontend/src/pages/Products/ProductCtaGroup.tsx, ProductDetailsPage.test.tsx
• frontend/src/pages/Plugins/PluginCtaGroup.tsx, PluginDetailsPage.test.tsx
• frontend/src/styles/navbar.css
• PROJECT_STATUS.md
Database Changes:
• carts table (UUID PK, user OneToOne, timestamps)
• cart_items table (UUID PK, cart FK, product_type, product_id, quantity, unique cart+type+id)
API Endpoints Added:
• GET /api/cart/ — full cart envelope with live subtotal (auth)
• POST /api/cart/ — add/merge item (auth, throttled)
• DELETE /api/cart/ — clear cart (auth, throttled)
• PATCH /api/cart/items/<uuid:item_id>/ — update quantity (auth, throttled)
• DELETE /api/cart/items/<uuid:item_id>/ — remove item (auth, throttled, IDOR → 404)
Frontend Pages/Components Added:
• /cart — CartPage (line items, quantity stepper, subtotal, disabled checkout)
• CartDrawer — navbar slide-over with link to full cart
• AddToCartButton — product/plugin detail CTAs
• useCart hook + cartApi client (TanStack Query; Zustand for drawer open state only)
Tests Added/Updated:
• backend/cart/test_cart.py — 15 tests (auth, CRUD, validation, totals, currency, IDOR, throttle)
• frontend cartApi, CartPage, Navbar, ProductDetailsPage, PluginDetailsPage tests
Security Checklist:
• Owner-only cart access; other users' item IDs return 404
• Only published products/plugins (active plugin category) can be added
• Write endpoints rate-limited (cart_write 30/min)
• No storage_path or package URLs in cart responses
• No order creation from cart (deferred to Feature 15)
• No console.log / placeholders in production code
Issues / Blockers:
• None
Next Recommended Task:
• Feature 7 Phase 2 — Customer order history UI (/dashboard/orders), or Feature 8 — Order integrity hardening (title snapshots)
Notes:
• Pricing policy: live catalog effective_price for display/subtotal; OrderService snapshots at checkout (Feature 15)
• Unavailable lines remain visible with is_available=false but excluded from subtotal
• Checkout button disabled with "Payments coming soon"

Date: 2026-07-29 (Feature 5 — Wishlist)
Working Hours:
Today's Objective: Customer wishlist — save published products/plugins for later with owner-scoped APIs and dashboard UI.
Modules Completed: backend wishlist app, customer wishlist APIs, dashboard page, catalog CTAs/cards, navbar count badge
Files Created:
• backend/wishlist/__init__.py, apps.py, models.py, services.py, serializers.py, views.py, urls.py, pagination.py, test_wishlist.py, migrations/0001_initial.py
• frontend/src/types/wishlist.ts
• frontend/src/api/wishlistApi.ts, wishlistApi.test.ts
• frontend/src/hooks/useWishlist.ts
• frontend/src/components/wishlist/WishlistToggle.tsx
• frontend/src/pages/Dashboard/WishlistPage.tsx, WishlistPage.test.tsx
Files Modified:
• backend/config/settings.py, backend/config/urls.py, backend/accounts/throttles.py
• frontend/src/App.tsx, Navbar.tsx, Navbar.test.tsx, DashboardPage.tsx
• frontend/src/pages/Products/ProductCtaGroup.tsx, ProductCard.tsx, ProductDetailsPage.tsx, ProductDetailsPage.test.tsx, ProductsBrowsePage.test.tsx
• frontend/src/pages/Plugins/PluginCtaGroup.tsx, PluginCard.tsx, PluginDetailsPage.tsx, PluginDetailsPage.test.tsx
• frontend/src/styles/products-browse.css, frontend/src/styles/navbar.css
• PROJECT_STATUS.md
Database Changes:
• wishlist_items table (UUID PK, user FK, product_type, product_id, timestamps, unique user+type+id)
API Endpoints Added:
• GET /api/wishlist/ — paginated list (auth; optional product_type filter)
• POST /api/wishlist/ — add item idempotently (auth, throttled)
• DELETE /api/wishlist/<uuid:item_id>/ — remove own item (auth, throttled, IDOR → 404)
Frontend Pages/Components Added:
• /dashboard/wishlist — WishlistPage (filters, pagination, empty/loading/error)
• WishlistToggle — detail chips + browse card heart icon
• useWishlist hook + wishlistApi client
Tests Added/Updated:
• backend/wishlist/test_wishlist.py — 14 tests (auth, CRUD, published validation, IDOR, throttle, pagination)
• frontend wishlistApi, WishlistPage, Navbar badge, ProductDetailsPage, PluginDetailsPage, ProductsBrowsePage tests — 45 tests passing in wishlist suite
Security Checklist:
• Owner-only queries; other users' item IDs return 404
• Only published products/plugins (active plugin category) can be added
• Write endpoints rate-limited (wishlist_write 30/min)
• No payment or order entitlement required
• No console.log / placeholders in production code
Issues / Blockers:
• None
Next Recommended Task:
• Feature 7 — Customer Order History (read-only)
Notes:
• Navbar and dashboard link to /dashboard/wishlist with optional count badge
• Stale wishlist rows for archived/unpublished items show is_available=false but remain removable

Date: 2026-07-29 (Phase 2C — Viewer performance + hardening)
Working Hours:
Today's Objective: Production-safe viewer — GPU cleanup, mobile performance, off-screen pause, edge-case hardening; mark Feature 2 complete.
Modules Completed: viewer disposal utilities, adaptive DPR + viewport visibility hooks, ModelViewer lifecycle hardening, expanded tests
Files Created:
• frontend/src/components/viewer/disposeSceneResources.ts
• frontend/src/components/viewer/disposeSceneResources.test.ts
• frontend/src/components/viewer/useViewportVisibility.ts
• frontend/src/components/viewer/useViewportVisibility.test.ts
• frontend/src/components/viewer/useAdaptivePixelRatio.ts
• frontend/src/components/viewer/useAdaptivePixelRatio.test.ts
• frontend/src/components/viewer/isWebGLAvailable.ts
• frontend/src/components/viewer/isWebGLAvailable.test.ts
Files Modified:
• frontend/src/components/viewer/ModelViewer.tsx (disposal, DPR cap, frameloop pause, WebGL gate, error boundary)
• frontend/src/components/viewer/ModelViewer.test.tsx (lifecycle, off-screen, WebGL fallback)
• frontend/src/pages/Products/ProductDetailsPage.test.tsx (unsafe preview_model URL integration)
• frontend/src/styles/product-details.css (viewer shell wrapper)
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• disposeSceneResources, useViewportVisibility, useAdaptivePixelRatio, isWebGLAvailable utilities
Frontend Pages/Components Modified:
• ModelViewer — disposes geometries/materials/textures + clears useGLTF cache on unmount; caps DPR on mobile; pauses frameloop off-screen; WebGL + corrupt-model fallbacks
Tests Added/Updated:
• disposeSceneResources.test.ts, useViewportVisibility.test.ts, useAdaptivePixelRatio.test.ts, isWebGLAvailable.test.ts
• ModelViewer.test.tsx — dispose/clear on unmount, frameloop never when hidden, WebGL unavailable
• ProductDetailsPage.test.tsx — rejects unsafe preview_model URLs (no viewer mount; URL not in DOM)
Security Checklist:
• Still loads only safe public preview_model URLs (.glb/.gltf http(s)); never storage_path / private packages
• Unsafe/empty preview_model falls back to image stage; raw URLs never rendered in UI
• useGLTF cache cleared on unmount to avoid retaining remote model bytes after navigate-away
• No secrets or console.log in production code
Issues / Blockers:
• None
Next Recommended Task:
• Feature 3 — Public Plugin Store UI
Notes:
• Ground/shadow skipped (not added — shadow maps would hurt mobile performance)
• Fullscreen mode remains optional deferred polish
• Plugin detail 3D preview explicitly out of scope unless requested later

Date: 2026-07-29 (Phase 2A — Viewer foundation)
Working Hours:
Today's Objective: Reusable lazy-loaded R3F + Drei viewer mounted on product detail when preview_model exists; image gallery fallback otherwise.
Modules Completed: frontend ModelViewer (code-split), product detail stage integration, URL safety helper, component + page tests
Files Created:
• frontend/src/components/viewer/ModelViewer.tsx
• frontend/src/components/viewer/LazyModelViewer.tsx
• frontend/src/components/viewer/isSafePreviewModelUrl.ts
• frontend/src/components/viewer/isSafePreviewModelUrl.test.ts
• frontend/src/components/viewer/ModelViewer.test.tsx
Files Modified:
• frontend/src/pages/Products/ProductImageGallery.tsx (3D/Images stage modes; LazyModelViewer mount)
• frontend/src/pages/Products/ProductDetailsPage.tsx (pass previewModelUrl)
• frontend/src/pages/Products/ProductDetailsPage.test.tsx (viewer mount, no-model image stage, lightbox via Images)
• frontend/src/styles/product-details.css (viewer canvas / progress / mode controls)
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• LazyModelViewer / ModelViewer — reusable public preview_model canvas (studio lights, Suspense progress, basic orbit)
Frontend Pages/Components Modified:
• Product detail left stage — shows 3D canvas when preview_model is a safe .glb/.gltf URL; image gallery when not
Tests Added/Updated:
• isSafePreviewModelUrl.test.ts — accept/reject URL cases
• ModelViewer.test.tsx — mount with mocked R3F; no-model fallback
• ProductDetailsPage.test.tsx — viewer mount, image fallback, lightbox after Images mode
Security Checklist:
• Loads only public preview_model; never ProductFile storage_path / private packages
• preview_model URL not rendered as visible text; http(s) + .glb/.gltf gate before load
• No R2 dependency; uses existing MEDIA / public preview URL pattern
• No secrets or console.log in production code
Issues / Blockers:
• None
Next Recommended Task:
• Feature 2 remaining — camera auto-fit/bounds, fullscreen + Escape, WebGL unavailable fallback, mobile pixel-ratio / off-screen pause
Notes:
• Three.js stays out of the main bundle via React.lazy(ModelViewer)
• Basic OrbitControls ship in 2A so the canvas is interactive; polish follows

Date: 2026-07-29 (Feature 1 — Public Product Details Page)
Working Hours:
Today's Objective: Ship the public product details page customers use before purchase (all Feature 1 sub-features; no R2/payments/3D viewer).
Modules Completed: frontend public product detail page + gallery/CTA/specs/preview + browse category deep-link + SEO hook + tests
Files Created:
• frontend/src/pages/Products/ProductDetailsPage.tsx
• frontend/src/pages/Products/ProductDetailsPage.test.tsx
• frontend/src/pages/Products/ProductImageGallery.tsx
• frontend/src/pages/Products/ProductCtaGroup.tsx
• frontend/src/pages/Products/ProductSpecs.tsx
• frontend/src/hooks/useDocumentSeo.ts
• frontend/src/styles/product-details.css
Files Modified:
• frontend/src/App.tsx (lazy /products/:slug route + product-details.css)
• frontend/src/pages/Products/ProductsBrowsePage.tsx (?category= query sync for breadcrumb back-links)
• frontend/src/pages/Products/ProductsBrowsePage.test.tsx (URL category filter coverage)
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reuses GET /api/products/<slug>/ and GET /api/products/?category_id=)
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• /products/:slug — Public Product Details Page (hero, gallery/lightbox, specs, related, SEO, CTAs, preview placeholder)
Frontend Pages/Components Modified:
• /products — reads/writes ?category= for category filter deep-links from product detail breadcrumb
Tests Added/Updated:
• ProductDetailsPage.test.tsx — route/load, 404, error retry, gallery keyboard lightbox, guest/auth CTAs, share, related products
• ProductsBrowsePage.test.tsx — category from URL query string
Security Checklist:
• Descriptions rendered as plain text (no dangerouslySetInnerHTML / XSS)
• Public detail reuses published-only API; draft/archived → 404 empty state
• No storage_path or raw package URLs rendered; preview_model URL never shown in UI (placeholder only)
• Share copies public product path only
• Cart gated; wishlist live for authenticated customers; guests redirected to login for both CTAs
• No secrets or console.log in production code
Issues / Blockers:
• None
Next Recommended Task:
• Feature 2 — Interactive 3D Viewer (mount into ProductPreviewSlot)
Notes:
• ProductCard already linked to /products/:slug; route now resolves
• 3D viewer intentionally deferred; clean preview placeholder ships now

Date: 2026-07-28 (Feature 21 — Admin orders UI)
Working Hours:
Today's Objective: Admin SPA for marketplace orders — list with filters/pagination, detail with line items, manual create; wire into admin nav and routes.
Modules Completed: frontend orders admin UI (types, API module, list/create page, detail page, nav/routes/dashboard)
Files Created:
• frontend/src/types/order.ts
• frontend/src/api/ordersApi.ts
• frontend/src/api/ordersApi.test.ts
• frontend/src/pages/Admin/AdminOrdersPage.tsx
• frontend/src/pages/Admin/AdminOrdersPage.test.tsx
• frontend/src/pages/Admin/AdminOrderDetailPage.tsx
• frontend/src/pages/Admin/AdminOrderDetailPage.test.tsx
Files Modified:
• frontend/src/config/adminNav.ts (Orders nav item)
• frontend/src/App.tsx (lazy /admin/orders + /admin/orders/:orderId routes)
• frontend/src/pages/Admin/AdminDashboardPage.tsx (Manage orders quick link)
• frontend/src/pages/Admin/AdminDashboardPage.test.tsx
• frontend/src/layouts/AdminLayout.test.tsx
• frontend/src/index.css (create-form line-item layout)
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reuses Phase 15B GET/POST /api/admin/orders/ and GET /api/admin/orders/:id/)
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• /admin/orders — list with search, order_status/payment_status filters, ordering, pagination, manual create form
• /admin/orders/:orderId — read-only detail with customer summary and line items
Frontend Pages/Components Modified:
• Admin nav — Orders enabled
• Admin dashboard — Manage orders quick link
Tests Added/Updated:
• ordersApi.test.ts — list/get/create API client coverage
• AdminOrdersPage.test.tsx — list + create flow
• AdminOrderDetailPage.test.tsx — detail + error state
• AdminLayout.test.tsx / AdminDashboardPage.test.tsx — Orders link assertions
Security Checklist:
• Admin pages remain behind AdminRoute (JWT + Administrator role); backend still enforces IsAdministrator
• No Axios calls in components — ordersApi service module only
• Create form validates customer, currency (3-letter), quantity, and duplicate catalog lines client-side; server remains source of truth for prices and permissions
• Catalog options limited to published products/plugins; customer options reuse admin users API (Customer role)
• No secrets, storage paths, or payment gateway data in UI
• Existing backend create throttle + order_create admin logging unchanged
Issues / Blockers:
• None
Next Recommended Task:
• Phase 15C — Customer order history APIs, or shopping cart / checkout
Notes:
• Detail is read-only in this feature (no status update UI yet; Phase 15B has GET/POST only)
• Manual create prices are resolved server-side via OrderService.create

Date: 2026-07-27 (Phase 15B — Admin order list + detail APIs)
Working Hours:
Today's Objective: Admin list/detail order APIs with filters, pagination, optional admin create, and API tests.
Modules Completed: orders admin API layer (serializers, views, admin_urls, list_admin service, tests)
Files Created:
• backend/orders/serializers.py
• backend/orders/pagination.py
• backend/orders/admin_urls.py
Files Modified:
• backend/orders/services.py (list_admin, build_catalog_titles)
• backend/orders/views.py (AdminOrderListCreateView, AdminOrderDetailView)
• backend/orders/test_orders.py (8 new API tests)
• backend/config/urls.py (api/admin/orders/)
• backend/accounts/throttles.py (AdminOrderWriteRateThrottle)
• backend/config/settings.py (admin_order_write rate)
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• GET /api/admin/orders/ — paginated admin order list (filters: order_status, payment_status, customer_id, search; ordering)
• POST /api/admin/orders/ — admin-only manual order create (throttled; logs order_create)
• GET /api/admin/orders/<uuid>/ — admin order detail (items + customer summary + live catalog titles)
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None
Frontend Pages/Components Modified:
• None
Tests Added/Updated:
• orders.test_orders — 24 tests total (+8: admin list, filters, search, detail, 403 customer, 404 missing, admin create)
Security Checklist:
• IsAuthenticated + IsAdministrator on all admin order endpoints
• Customer JWT returns 403 on admin order list/detail
• POST create throttled (admin_order_write 60/min) and logged via log_admin_action
• Filters validated (choice/uuid); search capped at 100 chars
• No payment data or storage paths exposed; purchase_price remains server-side snapshot
• Live title lookup uses ORM only (no user input in queries)
Issues / Blockers:
• None
Next Recommended Task:
• Feature 21 — Admin orders UI, or Phase 15C customer order history APIs, or shopping cart
Notes:
• Item titles use live Product/Plugin name lookup (not stored on OrderItem); null if catalog row deleted
• Admin create reuses OrderService.create for pricing/validation consistency with checkout flow

Date: 2026-07-27 (Phase 15A — Orders data model + service layer)
Working Hours:
Today's Objective: New orders Django app with Order/OrderItem models, OrderService (create, totals, status rules), Django admin, migrations, and tests.
Modules Completed: orders app (models, services, admin, migrations, tests)
Files Created:
• backend/orders/models.py
• backend/orders/services.py
• backend/orders/admin.py
• backend/orders/apps.py
• backend/orders/test_orders.py
• backend/orders/migrations/0001_initial.py
Files Modified:
• backend/config/settings.py (added orders to INSTALLED_APPS)
• PROJECT_STATUS.md
Database Changes:
• New tables: orders, order_items
• Indexes on order_status, payment_status, created_at, user+created_at, product_type+product_id
• Constraints: unique invoice_number, unique line item per order, quantity >= 1, purchase_price >= 0
API Endpoints Added:
• None (Phase 15A is service-layer only; no /api/admin/orders/ routes yet)
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None
Frontend Pages/Components Modified:
• None
Tests Added/Updated:
• orders.test_orders — 16 tests (model constraints, create order, invalid product/plugin, status transitions, totals)
Security Checklist:
• Order creation validates user exists and is active; catalog items must be published
• purchase_price snapshotted server-side from catalog (discount_price when set)
• Status transitions enforced server-side (pending→paid/cancelled, paid→refunded)
• No payment data stored; no custom_projects linkage
• Invoice numbers generated with secrets.token_hex (non-guessable)
Issues / Blockers:
• None
Next Recommended Task:
• Phase 15B — Order admin/customer APIs (list/detail) or shopping cart
Notes:
• Orders inspectable at /django-admin/ via OrderAdmin + OrderItemInline
• OrderService.create usable from Django shell and tests for seeding

Date: 2026-07-27 (Feature 14 — Project email notifications, Phases 2–5)
Working Hours:
Today's Objective: Quotation sent → customer email; quotation accepted → staff email + accept API; mark delivered → customer email; Django text templates; fail-soft tests; accept UI on customer project detail.
Modules Completed: ProjectWorkflowNotificationService, accept_quotation service, CustomerCustomProjectQuotationAcceptView, email templates, workflow email tests, frontend accept API + UI
Files Created:
• backend/custom_projects/templates/custom_projects/emails/project_created.txt
• backend/custom_projects/templates/custom_projects/emails/quotation_sent.txt
• backend/custom_projects/templates/custom_projects/emails/quotation_accepted.txt
• backend/custom_projects/templates/custom_projects/emails/project_delivered.txt
Files Modified:
• backend/custom_projects/notifications.py (added ProjectWorkflowNotificationService + _ProjectEmailSupport._customer_recipients/_render_body; shared support base)
• backend/custom_projects/services.py (upsert_quotation triggers quotation_sent; update_admin triggers project_delivered on status transition; new accept_quotation method)
• backend/custom_projects/views.py (new CustomerCustomProjectQuotationAcceptView)
• backend/custom_projects/urls.py (new /api/custom-projects/:id/quotation/accept/ route)
• backend/custom_projects/test_custom_projects.py (CustomProjectWorkflowEmailNotificationTests — 6 new tests)
• frontend/src/api/customProjectsApi.ts (acceptCustomerCustomProjectQuotation)
• frontend/src/api/customProjectsApi.test.ts (accept quotation API contract test)
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx (Accept quotation button + useMutation; uses toast.success)
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.test.tsx (3 new accept-quotation UI tests + vi.mock updated)
• PROJECT_STATUS.md
Database Changes:
• None — existing ProjectQuotation.status and CustomProject.status fields cover accepted/approved; no new migrations.
API Endpoints Added:
• POST /api/custom-projects/<uuid>/quotation/accept/ — customer accepts a pending quotation (IsAuthenticated + ownership; throttled; returns updated CustomerCustomProject)
API Endpoints Modified:
• POST /api/admin/custom-projects/<uuid>/quotation/ — now triggers quotation_sent email to customer after successful upsert
• PATCH /api/admin/custom-projects/<uuid>/ — now triggers project_delivered email to customer when status transitions to delivered
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None (modified existing)
Frontend Pages/Components Modified:
• CustomerProjectDetailPage — Accept quotation button (visible when status=quoted and quotation.status=pending); useMutation + toast on success; error message on failure
Tests Added/Updated:
• CustomProjectWorkflowEmailNotificationTests (6 new Django tests: quotation save, quotation accept via API, ACL isolation, mark delivered, mail failure non-blocking for accept + delivery, mail failure non-blocking for quotation save)
• CustomerProjectDetailPage tests (3 new: Accept button visible, success calls API, failure shows error)
• customProjectsApi.test.ts (1 new: accept quotation API contract)
Security Checklist:
• Email bodies exclude quote amount, notes, customer email, API URLs, and storage paths
• Acceptance requires authenticated project ownership (other customers get 404); admin accounts cannot be customers
• APPROVED transition enforced server-side via existing ALLOWED_STATUS_TRANSITIONS
• ProjectQuotation.status=PENDING gate prevents double-accept
• Quotation and delivery updates are atomic; notification runs after commit
• Customer accept endpoint throttled with existing CustomProjectWriteRateThrottle
Issues / Blockers:
• None
Next Recommended Task:
• Customer delivery UI on /dashboard/projects/:projectId (list + download delivered files)
Notes:
• Email templates added under custom_projects/templates/custom_projects/emails/ — Django APP_DIRS=True picks them up automatically
• _ProjectEmailSupport._render_body uses render_to_string (Django template engine); templates contain only safe static text + variable interpolation

Date: 2026-07-27 (Feature 14 — Project email notifications, Phase 1)
Working Hours:
Today's Objective: Email staff when a customer submits a new custom project request; reuse existing notification patterns and keep dev console-email behavior.
Modules Completed: project creation notification service, customer-create notification trigger, recipient-resolution reuse, API tests, status update
Files Created:
• None
Files Modified:
• backend/custom_projects/notifications.py
• backend/custom_projects/services.py
• backend/custom_projects/views.py
• backend/custom_projects/test_custom_projects.py
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• POST /api/custom-projects/ — now triggers staff email notification after successful customer project creation
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None
Frontend Pages/Components Modified:
• None
Tests Added/Updated:
• CustomProjectAPITests now cover project-create staff email delivery, configured recipients fallback, non-blocking mail failure, and no-email admin-created project behavior
Security Checklist:
• Reused existing recipient resolution to avoid duplicate mail-routing logic
• Email body excludes project description, customer email, API URLs, tokens, and storage paths
• Notification runs after successful create and mail failures are logged without breaking the API response
• Customer endpoint remains JWT-protected and throttled; admin create path does not emit customer-submission email
Issues / Blockers:
• None
Next Recommended Task:
• Feature 14 Phase 2: send notification when admin posts the first quotation / review-state transition customers need to act on
Notes:
• Reused the existing custom-project notification module rather than adding a second email stack
• Dev environments still satisfy the requirement through Django's console email backend by default

Date: 2026-07-24 (CP-DEL-06 Admin UI: Delivery section on project detail)
Working Hours:
Today's Objective: Deliverables section on /admin/projects/:id — upload, list (name/version/notes/size/date), download, Mark delivered / Mark completed
Modules Completed: AdminProjectDeliveriesSection, delivery API client methods, shared project file upload validation, admin detail wiring + tests
Files Created:
• frontend/src/pages/Admin/AdminProjectDeliveriesSection.tsx
• frontend/src/pages/Admin/AdminProjectDeliveriesSection.test.tsx
• frontend/src/lib/projectFileUpload.ts
• frontend/src/lib/projectDeliveryUpload.ts
• frontend/src/lib/projectDeliveryUpload.test.ts
Files Modified:
• frontend/src/pages/Admin/AdminProjectDetailPage.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.test.tsx
• frontend/src/api/customProjectsApi.ts
• frontend/src/api/customProjectsApi.test.ts
• frontend/src/types/customProject.ts
• frontend/src/lib/projectMessageUpload.ts (re-exports shared projectFileUpload)
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (UI consumes existing admin delivery + project update APIs)
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• AdminProjectDeliveriesSection (Deliverables on admin project detail)
Frontend Pages/Components Modified:
• AdminProjectDetailPage — mounts Deliverables section
Tests Added/Updated:
• AdminProjectDeliveriesSection tests (list/download, upload, invalid type, mark delivered/completed gating)
• customProjectsApi delivery client tests
• projectDeliveryUpload validation tests
• AdminProjectDetailPage loads Deliverables section
Security Checklist:
• Downloads go through authenticated blob API (never storage_path / raw MEDIA)
• Client validates extension/size; server still enforces validate_project_file_upload
• Mark delivered/completed gated in UI; status transitions still enforced server-side
• Notes rendered as React text (XSS-safe); no secrets or internal paths in UI
• Admin-only routes remain behind existing AdminRoute + IsAdministrator APIs
Issues / Blockers:
• None
Next Recommended Task:
• Customer delivery UI on /dashboard/projects/:projectId (list + download)
Notes:
• Reused admin media list patterns, message-section structure, and existing PATCH status update
• Shared client upload rules extracted to projectFileUpload (message + delivery re-export)
• Definition of Done satisfied for admin delivery UI slice

Date: 2026-07-24 (CP-DEL-03 List / Download Delivery Files API)
Working Hours:
Today's Objective: Admin + project-owner delivery list/download; authenticated FileResponse; hide storage_path; ACL for unauthorized users
Modules Completed: list_deliveries / get_delivery_for_admin|customer services, download_url on serializer, admin list+download, customer list+download, API tests
Files Created:
• None
Files Modified:
• backend/custom_projects/services.py
• backend/custom_projects/serializers.py
• backend/custom_projects/views.py
• backend/custom_projects/admin_urls.py
• backend/custom_projects/urls.py
• backend/custom_projects/test_custom_projects.py
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• GET /api/admin/custom-projects/<uuid>/deliveries/ — paginated delivery list (admin); includes download_url
• GET /api/admin/custom-projects/<uuid>/deliveries/<uuid>/download/ — authenticated admin download
• GET /api/custom-projects/<uuid>/deliveries/ — paginated delivery list (project owner)
• GET /api/custom-projects/<uuid>/deliveries/<uuid>/download/ — authenticated owner download
API Endpoints Modified:
• POST /api/admin/custom-projects/<uuid>/deliveries/ — same upload behavior; response now includes download_url (still never storage_path)
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None
Frontend Pages/Components Modified:
• None
Tests Added/Updated:
• ProjectDeliveryListDownloadAPITests (admin/owner list, download ACL, missing file 404, private media blocked)
• ProjectDeliveryUploadAPITests (customer POST on customer deliveries → 405; reverse name updated)
Security Checklist:
• JWT required; admin routes require IsAdministrator (customers → 403)
• Owner access via get_for_customer (other customers → 404; no project existence leak)
• storage_path never returned; downloads via open_stored_file FileResponse
• Private /media/custom_projects/deliveries/ still 404 without auth
• Admin download logged: custom_project_delivery_download
• Customers cannot upload (POST customer deliveries → 405)
Issues / Blockers:
• None
Next Recommended Task:
• Admin/customer delivery UI (upload on admin detail; list + download on admin + customer project detail)
Notes:
• Reused message-attachment download patterns and CustomProjectPagination
• Definition of Done satisfied for API-only slice (no frontend in this task)

Date: 2026-07-24 (CP-DEL-02 Admin upload delivery file API)
Working Hours:
Today's Objective: Admin-only multipart delivery upload; reuse project-file validation/storage patterns; hide storage_path; block customer uploads
Modules Completed: ProjectDeliveryStorageService, create_delivery service, admin upload endpoint, serializer (no storage_path), API tests
Files Created:
• None
Files Modified:
• backend/custom_projects/storage.py
• backend/custom_projects/services.py
• backend/custom_projects/serializers.py
• backend/custom_projects/views.py
• backend/custom_projects/admin_urls.py
• backend/custom_projects/test_custom_projects.py
• PROJECT_STATUS.md
Database Changes:
• None (uses existing custom_project_deliveries table from CP-DEL-01)
API Endpoints Added:
• POST /api/admin/custom-projects/<uuid>/deliveries/ — multipart file (required), notes (optional), version (optional; auto next if omitted)
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None
Frontend Pages/Components Modified:
• None
Tests Added/Updated:
• ProjectDeliveryUploadAPITests (admin upload, auto/explicit version, duplicate version, invalid file, customer 403, customer route 404, unauthenticated 401, private media blocked)
Security Checklist:
• IsAdministrator + JWT required; customers get 403 on admin endpoint; no customer /deliveries/ route
• Reuses validate_project_file_upload (MIME/extension/size/ZIP metadata)
• storage_path never returned in ProjectDeliverySerializer
• Deliveries stored under custom_projects/deliveries/ (not in PUBLIC_MEDIA_PREFIXES)
• Admin action logged: custom_project_delivery_upload
• Duplicate version cleaned up (orphaned file deleted) and returns 400
Issues / Blockers:
• None
Next Recommended Task:
• Secure customer/admin delivery download endpoints + admin upload UI
Notes:
• Allowed upload types match reference files (jpg/png/webp/pdf/zip) until product-style 3D formats are explicitly expanded for deliveries
• Risk verification (2026-07-24): ProjectDeliveryCrashRiskScenarioTests — glb/fbx/obj/blend return clean 400 (no 500); missing file / empty zip / bad version → 400; unicode+20k notes → 201; duplicate version → 400; storage_path omitted; private media → 404. Conclusion: reference-file validation is a product limitation (zip 3D assets), not a crash risk.

Date: 2026-07-24 (CP-DEL-01 Project delivery data model)
Working Hours:
Today's Objective: Add dedicated ProjectDelivery model + migration; Django admin registration; keep reference ProjectFile unchanged
Modules Completed: ProjectDelivery model, migration 0006, Django admin, model tests
Files Created:
• backend/custom_projects/migrations/0006_project_delivery.py
Files Modified:
• backend/custom_projects/models.py
• backend/custom_projects/admin.py
• backend/custom_projects/test_custom_projects.py
• PROJECT_STATUS.md
Database Changes:
• New table: custom_project_deliveries (UUID pk, project FK, uploaded_by FK, file_name, storage_path, file_size, version, notes, timestamps)
• Unique constraint: uniq_custom_project_delivery_version (project + version)
• Indexes on (project, version) and (project, created_at)
• Index rename on custom_project_message_attachments (Django auto-detected name alignment)
API Endpoints Added:
• None (model + admin only)
API Endpoints Modified:
• None
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None
Frontend Pages/Components Modified:
• None
Tests Added/Updated:
• ProjectDeliveryModelTests (create with version, duplicate version rejected, ProjectFile schema unchanged)
Security Checklist:
• storage_path readonly in Django admin (no public API yet)
• uploaded_by uses PROTECT; project CASCADE matches other child models
• No storage paths exposed via REST (no serializers/views added)
• Version uniqueness enforced at DB level
Issues / Blockers:
• None
Next Recommended Task:
• Admin deliverables upload API + secure customer download endpoints (build on ProjectDelivery)
Notes:
• Version stored as positive integer ≥ 1 (MinValueValidator); display as v1/v2 in UI when APIs ship
• Upload validation and storage service will reuse existing custom_projects upload patterns in the next task
• Risk verification (2026-07-24): admin create previously saved empty storage_path (readonly on add); fixed to editable on add / readonly on change. version=0 rejected. Duplicate version and invalid URL do not crash.

Date: 2026-07-24 (CP-MSG-08 Project message email notifications)
Working Hours:
Today's Objective: Email staff/customer when a project message is created; deep links; fail-soft delivery; outbox tests
Modules Completed: ProjectMessageNotificationService, create_message mail hook, settings recipients, Django mail.outbox tests
Files Created:
• backend/custom_projects/notifications.py
Files Modified:
• backend/custom_projects/services.py
• backend/custom_projects/test_custom_projects.py
• backend/config/settings.py
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• POST /api/custom-projects/<uuid>/messages/ — after successful create, emails staff (assigned designer or configured recipients)
• POST /api/admin/custom-projects/<uuid>/messages/ — after successful create, emails project customer
API Endpoints Removed:
• None
Frontend Pages/Components Added:
• None
Frontend Pages/Components Modified:
• None
Tests Added/Updated:
• CustomProjectMessageEmailNotificationTests (customer→default/configured/designer; admin→customer; fail-soft; no body/secrets in email)
Security Checklist:
• No secrets/tokens/message bodies/storage paths in notification emails
• Recipient emails not echoed in API responses; deep links are frontend routes only
• Mail exceptions logged without breaking message create
• Reuses existing EMAIL_BACKEND / DEFAULT_FROM_EMAIL / FRONTEND_BASE_URL
Issues / Blockers:
• None
Next Recommended Task:
• Project deliverables upload and secure project downloads (or customer quote approval UI)
Notes:
• Set PROJECT_MESSAGE_ADMIN_RECIPIENTS (comma-separated) in production so customer messages do not rely solely on DEFAULT_FROM_EMAIL
• Console EmailBackend locally; configure SMTP env vars for production delivery

Date: 2026-07-24 (CP-MSG-07 Project message attachments)
Working Hours:
Today's Objective: Message attachments — model, upload validation, owner/admin download, customer+admin composers, tests
Modules Completed: ProjectMessageAttachment model, multipart message create, customer+admin download endpoints, thread/composer UI, tests
Files Created:
• backend/custom_projects/migrations/0005_project_message_attachments.py
• frontend/src/lib/projectMessageUpload.ts
• frontend/src/lib/projectMessageUpload.test.ts
Files Modified:
• backend/custom_projects/models.py
• backend/custom_projects/storage.py
• backend/custom_projects/services.py
• backend/custom_projects/serializers.py
• backend/custom_projects/views.py
• backend/custom_projects/urls.py
• backend/custom_projects/admin_urls.py
• backend/custom_projects/admin.py
• backend/custom_projects/test_custom_projects.py
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/api/customProjectsApi.test.ts
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.tsx
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.test.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.test.tsx
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.test.tsx
• frontend/src/lib/projectMessages.test.ts
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• Alter custom_project_messages.body to allow blank (attachment-only messages)
• New table: custom_project_message_attachments (UUID pk, message FK, file_name, storage_path, file_size, timestamps)
API Endpoints Added:
• GET /api/custom-projects/<uuid>/messages/<uuid>/attachments/<uuid>/download/
• GET /api/admin/custom-projects/<uuid>/messages/<uuid>/attachments/<uuid>/download/
API Endpoints Modified:
• POST /api/custom-projects/<uuid>/messages/ — accepts multipart body+optional file; response includes attachments[]
• POST /api/admin/custom-projects/<uuid>/messages/ — same
• GET message list endpoints — each message includes attachments[] with download_url (never storage_path)
Frontend Pages Created/Updated:
• Customer/Admin message sections — attach on send, show attachments in thread, download buttons
Problems Encountered:
• None blocking
Solutions Implemented:
• Reused validate_project_file_upload + ProductMediaStorageService pattern with custom_projects/messages/ prefix
• Attach-on-send (multipart) rather than separate attach-then-send flow
• Private media: /media/ returns 404; downloads via authenticated open_stored_file
Verification:
• backend custom_projects: 26/26 passed
• frontend attachment-related suites: 78/78 passed
• tsc --noEmit: 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• Customer download uses get_for_customer (other owners → 404); admin download requires IsAdministrator
• storage_path never returned in serializers; public /media/ path blocked for custom_projects/
• Upload MIME/extension/size validated server-side (client checks are UX only); create throttled
• Message body and file names rendered as React text (XSS-safe)
Next Development Task:
• Customer reference upload UI, or quote approval (Client Approval), or public product details page
Date: 2026-07-24 (CP-MSG-06 unread risk verification)
Working Hours:
Today's Objective: Determine whether unread/read-cursor assumptions are risky; crash-test real-world scenarios; fix if needed
Modules Completed: Backend unread risk scenario suite + frontend mark-read failure / no-storm tests
Files Created:
• None
Files Modified:
• backend/custom_projects/test_custom_projects.py
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.test.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.test.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• None (verification only)
Problems Encountered:
• No crashes found
Solutions Implemented:
• N/A — assumptions held under scenario tests; no production code changes required
Verification:
• Backend unread risk + mark-read/count tests: passed
• Frontend message-section risk tests (mark-read failure, no request storm): 29/29 passed
Security Review:
• No medium, high, or critical issues found
• Confirmed: empty-thread mark-read, double mark-read, multi-unread, re-unread after new message, independent admin cursors, peer-admin unread, open+mark-read flow
• Confirmed: mark-read failure does not hide the thread; no mark-read/list storm after open
Next Development Task:
• Customer reference upload UI, or quote approval (Client Approval), or public product details page
Date: 2026-07-24 (CP-MSG-06 Project message unread indicators)
Working Hours:
Today's Objective: Track message read state; mark thread read on open; unread badges on customer/admin project lists
Modules Completed: ProjectMessageReadState model, mark-read APIs, unread_count/has_unread on list serializers, customer/admin list badges, open-thread mark-read, tests
Files Created:
• backend/custom_projects/migrations/0004_project_message_read_state.py
Files Modified:
• backend/custom_projects/models.py
• backend/custom_projects/services.py
• backend/custom_projects/serializers.py
• backend/custom_projects/views.py
• backend/custom_projects/urls.py
• backend/custom_projects/admin_urls.py
• backend/custom_projects/admin.py
• backend/custom_projects/test_custom_projects.py
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/api/customProjectsApi.test.ts
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.tsx
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.test.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.test.tsx
• frontend/src/pages/Dashboard/MyProjectsPage.tsx
• frontend/src/pages/Dashboard/MyProjectsPage.test.tsx
• frontend/src/pages/Admin/AdminProjectsPage.tsx
• frontend/src/pages/Admin/AdminProjectsPage.test.tsx
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.test.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.test.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• New table: custom_project_message_read_states (UUID pk, project FK, user FK, last_read_at, timestamps; unique project+user)
API Endpoints Added:
• POST /api/custom-projects/<uuid>/messages/read/
• POST /api/admin/custom-projects/<uuid>/messages/read/
API Endpoints Modified:
• GET /api/custom-projects/ — adds unread_count, has_unread (viewer-scoped)
• GET /api/admin/custom-projects/ — adds unread_count, has_unread (viewer-scoped)
Frontend Pages Created/Updated:
• /dashboard/projects — unread badge per project title
• /admin/projects — unread badge + row cue for projects with unread messages
• Customer/Admin message sections — mark thread read after successful load
Problems Encountered:
• Broad TanStack Query invalidation prefix matched message queries and caused refetch loops
Solutions Implemented:
• Mark-read invalidates only list queries (object filter key), not detail/messages
• Unread count excludes the viewer's own messages; other customers get 404 on mark-read
Verification:
• backend custom_projects: 19/19 passed
• frontend unread-related suites: 78/78 passed
• tsc --noEmit: 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• Customer mark-read uses get_for_customer (ownership → 404); admin mark-read requires IsAdministrator
• Mark-read endpoints throttled with existing write throttles
• Unread annotations are viewer-scoped; no cross-customer leakage
• List/badge UI remains behind ProtectedRoute / AdminRoute
Next Development Task:
• Customer reference upload UI, or quote approval (Client Approval), or public product details page
Date: 2026-07-24 (CP-MSG risk verification — labels + page size)
Working Hours:
Today's Objective: Determine whether multi-admin labeling and page_size=100 risks cause crashes or silent failures; fix if needed
Modules Completed: Scenario tests + fixes for admin sender labels and latest-message window loading
Files Created:
• frontend/src/lib/projectMessages.ts
• frontend/src/lib/projectMessages.test.ts
Files Modified:
• frontend/src/pages/Admin/AdminProjectMessagesSection.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.test.tsx
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.tsx
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.test.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.tsx
• backend/custom_projects/test_custom_projects.py
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• Admin/Customer message sections — safer labels + latest 100-message window
Problems Encountered:
• No crashes found
• Risk 1: other admins were labeled "Customer" (misleading, not a crash)
• Risk 2: page 1 only showed oldest 100 messages; newest replies hidden when count > 100 (silent data loss, not a crash)
Solutions Implemented:
• Admin labels: You / Customer / other sender full_name (fallback Studio)
• Shared fetchLatestProjectMessages loads the chronological latest window across pages
• UI notice when thread is truncated to latest 100
Verification:
• frontend projectMessages + message section tests: 32/32 passed
• backend CustomProjectMessageApiTests including 101-message page-cap scenario: passed
• tsc / oxlint: clean
Security Review:
• No medium, high, or critical issues found
• Labeling uses existing sender id/full_name only; no HTML rendering changes
Next Development Task:
• Customer reference upload UI, or quote approval (Client Approval), or public product details page
Date: 2026-07-24 (CP-MSG-05 Admin project messages UI)
Working Hours:
Today's Objective: Admin project messages UI on /admin/projects/:projectId
Modules Completed: Admin messages API client, Messages section (separated from Admin notes), chronological You/Customer thread, reply composer with loading/empty/error, tests
Files Created:
• frontend/src/pages/Admin/AdminProjectMessagesSection.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.test.tsx
Files Modified:
• frontend/src/api/customProjectsApi.ts
• frontend/src/api/customProjectsApi.test.ts
• frontend/src/pages/Admin/AdminProjectDetailPage.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.test.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET/POST /api/admin/custom-projects/<uuid>/messages/)
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• /admin/projects/:projectId — Messages section (thread, empty/loading/error, reply composer)
Problems Encountered:
• None
Solutions Implemented:
• Mirrored CustomerProjectMessagesSection patterns with admin API + You/Customer labels
• Visual separation via dedicated section + hint text + border-top (Admin notes remain in review form)
Verification:
• AdminProjectMessagesSection + AdminProjectDetailPage + customProjectsApi tests: 22/22 passed
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint: clean
Security Review:
• No medium, high, or critical issues found
• Page remains behind AdminRoute; messages API requires IsAdministrator
• API calls via customProjectsApi (authenticated apiClient); no Axios in components
• Message body rendered as text nodes only (XSS-safe); no dangerouslySetInnerHTML
• Client trim/empty/max-length checks; server remains source of truth for validation/throttle
• Admin notes stay on project update form and are not mixed into the customer-visible message thread
Next Development Task:
• Customer reference upload UI, or quote approval (Client Approval), or public product details page
Date: 2026-07-24 (CP-MSG-04 verification)
Working Hours:
Today's Objective: Confirm customer project messages UI meets requirements; no new code required
Modules Completed: Re-verified thread load/render, composer send success/failure, empty state, XSS-safe text rendering
Files Created:
• None
Files Modified:
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• None (existing CustomerProjectMessagesSection on project detail)
Problems Encountered:
• None — feature already implemented on feature/custom-project-messages-backend
Solutions Implemented:
• N/A (verification only)
Verification:
• CustomerProjectMessagesSection + CustomerProjectDetailPage + customProjectsApi tests: 36/36 passed
• oxlint: clean; tsc --noEmit: 0 errors
Security Review:
• No medium, high, or critical issues found
• Reconfirmed: text-only body render, API via customProjectsApi, ownership gated by detail + ProtectedRoute, client max-length + server validation/throttle
Next Development Task:
• CP-MSG-05 Admin project messages UI
Date: 2026-07-23 (CP-MSG-04 Customer project messages UI)
Working Hours:
Today's Objective: Customer project messages UI
Modules Completed: Messages section on customer project detail, list/create API client, chronological You/Studio thread, composer with submit/error states, tests
Files Created:
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.tsx
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.test.tsx
Files Modified:
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/api/customProjectsApi.test.ts
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.test.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET/POST /api/custom-projects/<uuid>/messages/)
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• Customer project detail — Messages section (thread, empty state, composer, loading/error)
Problems Encountered:
• None
Solutions Implemented:
• Reused existing customer messages API, TanStack Query, Alert/ErrorState/Spinner/FormField patterns
• Sender label from current user id (You) vs other senders (Studio); body rendered as React text (XSS-safe)
Verification:
• CustomerProjectMessagesSection tests: 5/5 passed (thread labels, empty, send success, send failure, XSS text)
• CustomerProjectDetailPage tests: still passing with messages mocked
• customProjectsApi message client tests: passed
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• Messages load/send only after project detail succeeds (ownership already gated by detail API + ProtectedRoute)
• API calls via customProjectsApi (authenticated apiClient); no Axios in components
• Message body rendered as text nodes only (no dangerouslySetInnerHTML); HTML payloads stay escaped
• Client trims/validates empty + max length; server remains source of truth for validation/throttle
• Sender email not exposed (matches public message serializer)
Next Development Task:
• CP-MSG-05 Admin project messages UI (or customer reference upload / quote approval)
Date: 2026-07-23 (CP-MSG-03 Customer project detail UI)
Working Hours:
Today's Objective: Customer project detail UI
Modules Completed: Protected customer project detail page, quotation display, reference file list, loading/404/error states, tests
Files Created:
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.test.tsx
Files Modified:
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET /api/custom-projects/<uuid>/)
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• /dashboard/projects/:projectId — full customer project detail (title, description, status, payment status, deadline, category, budget, quotation block, reference files; loading / 404-or-forbidden / error+retry; back link to My Projects)
Problems Encountered:
• Query-level retry overrode the test client's retry:false and hid the recoverable error state
Solutions Implemented:
• Disabled auto-retry on detail query; 404/403 show not-found without Retry; recoverable errors use Retry button
• Reused getCustomerCustomProject, ProtectedRoute, ErrorState/Spinner, admin-media file list styles, formatFileSize
Verification:
• CustomerProjectDetailPage tests: 5/5 passed (happy path, empty quote/files, 404, error/retry, back link)
• MyProjectsPage tests: 7/7 passed
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• Route gated by ProtectedRoute (JWT session required)
• Ownership enforced server-side (404 for other customers); UI treats 404/403 as not-found without leaking existence details beyond API message
• No Axios in components; API via customProjectsApi; React text rendering for user-generated title/description/notes/file names
• Customer file list uses public metadata only (no download_url / storage_path)
• Approve/reject quotation and file upload UI intentionally out of scope
Next Development Task:
• CP-MSG-04 Customer project messages UI (thread on detail page)
Date: 2026-07-23 (CP-MSG-02 Customer My Projects list UI)
Working Hours:
Today's Objective: Customer My Projects list UI
Modules Completed: Customer custom-projects API client, My Projects list page, protected routes, nav/dashboard links, basic customer project detail shell, tests
Files Created:
• frontend/src/pages/Dashboard/MyProjectsPage.tsx
• frontend/src/pages/Dashboard/MyProjectsPage.test.tsx
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx
Files Modified:
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/App.tsx
• frontend/src/components/Navbar.tsx
• frontend/src/components/Navbar.test.tsx
• frontend/src/pages/Dashboard/DashboardPage.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET /api/custom-projects/ and GET /api/custom-projects/<uuid>/)
API Endpoints Modified:
• None
Frontend Pages Created:
• /dashboard/projects — My Projects list (title, status, updated date, quote amount; loading/empty/error; row → detail)
• /dashboard/projects/:projectId — basic customer project detail shell (title, status, description, quote)
Problems Encountered:
• List API exposes quotation_amount but not quotation status; quote column shows amount when present
Solutions Implemented:
• Reused ProtectedRoute, customProjectsApi module pattern, TanStack Query, AdminProjectsPage table/loading/error patterns, Spinner/ErrorState
Verification:
• MyProjectsPage tests: 7/7 passed (list, quote dash, navigation, empty, page recovery, error/retry)
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• List/detail routes gated by ProtectedRoute (JWT session required)
• API client reuses authenticated apiClient; ownership enforced server-side (404 for other customers)
• No Axios calls in components; user-generated titles rendered via React text nodes
• Admin users do not see My Projects nav link
• Real-world hardening: empty later-page auto-recovery; title uses real Link (open in new tab)
Next Development Task:
• CP-MSG-03 Customer project detail UI (fields, quote display, reference files, states)
Date: 2026-07-23 (CP-MSG-01 Project messages backend)
Working Hours:
Today's Objective: Project messages backend (API + model)
Modules Completed: ProjectMessage model, customer/admin list+create APIs, validation, pagination, create throttles, ownership/RBAC, admin security logging, tests
Files Created:
• backend/custom_projects/migrations/0002_project_messages.py
Files Modified:
• backend/custom_projects/models.py
• backend/custom_projects/services.py
• backend/custom_projects/serializers.py
• backend/custom_projects/views.py
• backend/custom_projects/urls.py
• backend/custom_projects/admin_urls.py
• backend/custom_projects/admin.py
• backend/custom_projects/test_custom_projects.py
• PROJECT_STATUS.md
Database Changes:
• New table: custom_project_messages (UUID pk, project FK, sender FK, body, created_at, updated_at; indexes on created_at and project+created_at)
API Endpoints Added:
• GET/POST /api/custom-projects/<uuid>/messages/
• GET/POST /api/admin/custom-projects/<uuid>/messages/
API Endpoints Modified:
• None
Frontend Pages Created:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused CustomProjectService ownership helpers, CustomProjectPagination, existing write throttles, log_admin_action, and nested file-upload view patterns
Verification:
• custom_projects tests: 15/15 passed
Security Review:
• No medium, high, or critical issues found
• Customer message routes resolve project via get_for_customer (other owners → 404)
• Admin message routes require IsAdministrator
• Message serializers never include admin_notes
• Create endpoints rate-limited; admin creates logged as custom_project_message_create
Next Development Task:
• CP-MSG-02 Customer My Projects list UI
Date: 2026-07-22 (Public Products Browse Page)
Working Hours:
Today's Objective: Public products Browse Page (/products)
Modules Completed: Public product/category API clients, ProductCard component, ProductsBrowsePage, CSS styling, tests, routing & navigation
Files Created:
• frontend/src/pages/Products/ProductCard.tsx
• frontend/src/pages/Products/ProductsBrowsePage.tsx
• frontend/src/pages/Products/ProductsBrowsePage.test.tsx
• frontend/src/styles/products-browse.css
Files Modified:
• frontend/src/types/product.ts
• frontend/src/types/category.ts
• frontend/src/api/productsApi.ts
• frontend/src/api/categoriesApi.ts
• frontend/src/App.tsx
• frontend/src/components/Navbar.tsx
• frontend/src/pages/Home/HomePage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• Reused GET /api/products/ and GET /api/categories/
Frontend Pages Created:
• /products (and /Products) — Public Products Browse Page with hero, debounced search, category filter, license filter, sorting, pagination, skeletal loading, error retry, and empty state
Verification:
• Full frontend test suite: 90/90 passed
• Full backend test suite (products & categories): 16/16 passed
• Frontend TypeScript build (`npm run build`): 0 errors
• Frontend linter (`oxlint`): 0 warnings, 0 errors
Security Review:
• Public serializer hides backend `storage_path` and sensitive metadata
• React JSX sanitizes rendering against XSS
• Input sanitized and debounced client-side before API calls
Date: 2026-07-22 (Custom Projects admin)
Working Hours:
Today's Objective: Custom Projects administrator management (Feature 8)
Modules Completed: custom_projects Django app, customer request APIs, admin review/quote APIs, admin UI list/detail, dashboard project stats, tests
Files Created:
• backend/custom_projects/ (models, services, serializers, views, urls, admin_urls, storage, upload_rules, pagination, admin, migration, tests)
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/pages/Admin/AdminProjectsPage.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.tsx
• frontend/src/pages/Admin/AdminProjectsPage.test.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.test.tsx
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• backend/accounts/throttles.py
• backend/analytics/services.py
• backend/analytics/test_dashboard_stats.py
• frontend/src/App.tsx
• frontend/src/config/adminNav.ts
• frontend/src/layouts/AdminLayout.test.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• PROJECT_STATUS.md
Database Changes:
• New tables: custom_projects, custom_project_files, custom_project_quotations
API Endpoints Added:
• GET/POST /api/custom-projects/
• GET/POST /api/custom-projects/<uuid>/
• POST /api/custom-projects/<uuid>/files/
• GET/POST /api/admin/custom-projects/
• GET/PATCH /api/admin/custom-projects/<uuid>/
• POST /api/admin/custom-projects/<uuid>/quotation/
API Endpoints Modified:
• GET /api/admin/dashboard/stats/ — custom project pending/live/completed counts are live
Frontend Pages Created:
• /admin/projects — list/create with search, status/payment filters, ordering, pagination
• /admin/projects/:projectId — review, assign designer, update status/notes, set quotation, view reference files
Problems Encountered:
• None blocking
Solutions Implemented:
• Reused products/plugins admin patterns, IsAdministrator, log_admin_action, pagination, storage, and upload validation patterns
• Enforced custom-project status transitions in the service layer
Verification:
• custom_projects + dashboard stats backend: 9/9 tests passed
• Frontend project admin tests: 4/4 passed
• Frontend lint (oxlint): passed
Security Review:
• No medium, high, or critical issues found
• Admin routes remain protected by AdminRoute and backend IsAdministrator
• Customer project detail is ownership-scoped; other customers receive 404
• Customer file responses omit storage_path; upload MIME/extension/size validated server-side
• Admin write endpoints throttled (admin_custom_project_write / custom_project_write)
• Admin create/update/quotation actions logged via log_admin_action
Next Development Task:
• Customer My Projects UI (list/detail, reference upload UI, quote approval)
Date: 2026-07-21 (Plugins admin UI)
Working Hours:
Today's Objective: Plugins administrator UI (Feature 7)
Modules Completed: Plugin and plugin-category types/API client, plugin CRUD UI, filters/ordering/pagination, media management, plugin-category management, admin navigation/dashboard wiring, tests
Files Created:
• frontend/src/types/plugin.ts
• frontend/src/api/pluginsApi.ts
• frontend/src/lib/pluginUpload.ts
• frontend/src/pages/Admin/AdminPluginsPage.tsx
• frontend/src/pages/Admin/AdminPluginDetailPage.tsx
• frontend/src/pages/Admin/PluginMediaSection.tsx
• frontend/src/pages/Admin/AdminPluginCategoriesPage.tsx
• frontend/src/pages/Admin/AdminPluginCategoryDetailPage.tsx
• frontend/src/pages/Admin/AdminPluginsPage.test.tsx
• frontend/src/pages/Admin/AdminPluginDetailPage.test.tsx
• frontend/src/pages/Admin/PluginMediaSection.test.tsx
• frontend/src/pages/Admin/AdminPluginCategoriesPage.test.tsx
• frontend/src/pages/Admin/AdminPluginCategoryDetailPage.test.tsx
• frontend/src/api/pluginsApi.test.ts
• frontend/src/hooks/useDebouncedValue.ts
• frontend/src/hooks/useDebouncedValue.test.ts
Files Modified:
• frontend/src/App.tsx
• frontend/src/config/adminNav.ts
• frontend/src/layouts/AdminLayout.test.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/pages/Admin/AdminDashboardPage.test.tsx
• frontend/src/pages/Admin/ProductMediaSection.test.tsx
• frontend/src/pages/EmailVerification/useEmailVerification.ts
• backend/config/settings.py
• backend/plugins/services.py
• backend/plugins/serializers.py
• backend/plugins/views.py
• backend/plugins/test_plugins.py
• backend/requirements.txt
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused existing plugin administrator APIs)
Frontend Pages Created:
• /admin/plugins — list/create with search, status/category filters, ordering, and pagination
• /admin/plugins/:pluginId — edit/archive and image/package management
• /admin/plugin-categories — list/create/filter/pagination
• /admin/plugin-categories/:categoryId — edit/deactivate
Problems Encountered:
• Existing unused import in ProductMediaSection.test.tsx blocked TypeScript production build
• Backend dependency audit found known vulnerabilities in Pillow 11.3.0
• Public plugin lists loaded image/file collections that their serializer does not return
• Plugin-admin rate limiting and package MIME/size limits lacked direct regression tests
• Media query refreshes could overwrite unsaved plugin form changes
• Category selectors stopped after 100 records and search issued one request per keystroke
• Admin plugin lists fetched detail-only media and package storage URLs were exposed to the UI
Solutions Implemented:
• Reused product/category admin architecture and media UI patterns; removed the stale test import
• Upgraded Pillow to 12.3.0; final pip-audit reports no known vulnerabilities
• Removed unused public-list media prefetches and added a constant-query-count test
• Added plugin throttle, package MIME/size, and backend CSP regression assertions
• Lazy-loaded plugin admin pages, reducing the entry bundle below the warning threshold
• Initialized edit forms once per plugin, removed stale thumbnail/category updates, and added a media-refresh regression test
• Loaded every category page, debounced search, and eliminated duplicate/before-redirect refetches
• Added a lightweight admin-list serializer/query, removed package storage paths from API/UI, and validated each upload once
Verification:
• Plugin-focused frontend: 15/15 selected follow-up tests passed
• Full frontend: 79/79 tests passed
• Frontend lint: passed with no warnings
• Frontend production build: passed; entry bundle is 490.48 kB
• Plugin backend: 25/25 tests passed
• Full backend: 120/120 tests passed
• npm audit: 0 vulnerabilities
• pip-audit: no known vulnerabilities
• Django deployment checks and migration drift checks passed
Security Review:
• No medium, high, or critical issues found
• Admin routes remain protected by AdminRoute and backend IsAdministrator
• Frontend upload checks are UX validation; backend remains authoritative for MIME, signature, size, and archive metadata validation
• Backend CSP is enforced; frontend-host CSP remains a deployment/CDN responsibility
• Package storage URLs are no longer returned or rendered; authenticated entitlement-based downloads are still required before a public paid-download flow
Next Development Task:
• Public plugin store listing and detail UI
Date: 2026-07-21 (Plugins backend)
Working Hours:
Today's Objective: Plugin catalog Django app (Feature 6)
Modules Completed: PluginCategory, Plugin, PluginImage, PluginFile, public/admin APIs, uploads, tests
Files Created:
• backend/plugins/ (models, services, serializers, views, URLs, storage, upload rules, admin, pagination, migration, tests)
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• backend/accounts/throttles.py
• backend/analytics/services.py
• backend/analytics/test_dashboard_stats.py
• PROJECT_STATUS.md
Database Changes:
• New tables: plugin_categories, plugins, plugin_images, plugin_files
• Database constraints: valid pricing/rating ranges and one primary image/file per plugin
API Endpoints Added:
• GET /api/plugin-categories/
• GET /api/plugin-categories/<slug>/
• GET /api/plugins/
• GET /api/plugins/<slug>/
• GET/POST /api/admin/plugin-categories/
• GET/PATCH/DELETE /api/admin/plugin-categories/<uuid>/
• GET/POST /api/admin/plugins/
• GET/PATCH/DELETE /api/admin/plugins/<uuid>/
• POST /api/admin/plugins/<uuid>/images/
• DELETE /api/admin/plugins/<uuid>/images/<uuid>/
• POST /api/admin/plugins/<uuid>/files/
• DELETE /api/admin/plugins/<uuid>/files/<uuid>/
API Endpoints Modified:
• GET /api/admin/dashboard/stats/ — plugin total is now live
Frontend Pages Modified:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused product/category service, serializer, permission, pagination, logging, storage, and upload patterns
• Added archive signature checks plus ZIP path traversal, symlink, encryption, entry count, and expansion limits
Verification:
• Plugin backend: 18/18 tests passed
• Full backend: 115/115 tests passed
• Full frontend: 64/64 tests passed
• Django checks and migration drift checks passed
Security Review:
• No medium, high, or critical issues found
Next Development Task:
• Plugins admin UI (Feature 7)
Date: 2026-07-20 (Product management polish)
Working Hours:
Today's Objective: USDZ upload support + improved admin product media UX (Feature 3)
Modules Completed: upload_rules USDZ, ProductMediaSection component, format helpers, tests
Files Created:
• frontend/src/lib/productUpload.ts
• frontend/src/lib/productUpload.test.ts
• frontend/src/pages/Admin/ProductMediaSection.tsx
• frontend/src/pages/Admin/ProductMediaSection.test.tsx
Files Modified:
• backend/products/upload_rules.py
• backend/products/test_products.py
• frontend/src/pages/Admin/AdminProductDetailPage.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.test.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (extended existing product file upload validation)
API Endpoints Modified:
• POST /api/admin/products/<uuid>/files/ — now accepts .usdz (model/vnd.usdz+zip)
Frontend Pages Modified:
• /admin/products/:productId — polished images/files upload section with drag-and-drop, badges, thumbnails
Problems Encountered:
• None
Solutions Implemented:
• Extracted ProductMediaSection; shared productUpload constants mirror backend rules
Lessons Learned:
• Primary image upload already sets thumbnail server-side; UI now explains that clearly
Next Development Task:
• Plugins backend (Feature 6)
Date: 2026-07-20 (Admin home dashboard stats)
Working Hours:
Today's Objective: Admin home dashboard with real stats (Feature 2)
Modules Completed: analytics app, dashboard stats API, AdminDashboardPage stats UI, tests
Files Created:
• backend/analytics/ (services, serializers, views, admin_urls, test_dashboard_stats.py)
• frontend/src/api/dashboardApi.ts
• frontend/src/types/dashboard.ts
• frontend/src/pages/Admin/AdminDashboardPage.test.tsx
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/styles/admin-layout.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• GET /api/admin/dashboard/stats/
Frontend Pages Modified:
• /admin — AdminDashboardPage now shows stat cards and live category breakdown
Problems Encountered:
• None
Solutions Implemented:
• New analytics app aggregates users/products/categories with efficient Count queries; placeholders for plugins/projects/sales until those modules ship
Lessons Learned:
• Category breakdown uses distinct Count to avoid duplicate rows from published filter joins
Next Development Task:
• Product management polish — USDZ support and upload UX (Feature 3)
Date: 2026-07-20 (Admin layout & navigation)
Working Hours:
Today's Objective: Admin layout & navigation (Feature 1)
Modules Completed: AdminLayout shell, sidebar nav, header, mobile menu, useAdminSession hook, tests
Files Created:
• frontend/src/layouts/AdminLayout.tsx
• frontend/src/layouts/AdminLayout.test.tsx
• frontend/src/hooks/useAdminSession.ts
• frontend/src/config/adminNav.ts
• frontend/src/styles/admin-layout.css
Files Modified:
• frontend/src/routes/AdminRoute.tsx
• frontend/src/routes/AdminRoute.test.tsx
• frontend/src/App.tsx
• frontend/src/index.css
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/pages/Admin/AdminCategoriesPage.tsx
• frontend/src/pages/Admin/AdminProductsPage.tsx
• frontend/src/pages/Admin/AdminUsersPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
Frontend Pages Created:
• None (layout wraps existing /admin/* routes)
Frontend Components Added:
• AdminLayout (sidebar + header shell for all admin routes except /admin/login)
Problems Encountered:
• None
Solutions Implemented:
• Centralized admin session verification and sign-out in useAdminSession; hid public Navbar on admin routes
Lessons Learned:
• Future admin sections (Plugins, Projects, Analytics) can be enabled in adminNav.ts as modules ship
Next Development Task:
• Admin home dashboard with real stats (Feature 2)
Date: 2026-07-20 (Admin Products UI)
Working Hours:
Today's Objective: Admin Products UI (React)
Modules Completed: productsApi client, admin list/create/detail pages, image/file uploads, routes, dashboard link, tests
Files Created:
• frontend/src/api/productsApi.ts
• frontend/src/types/product.ts
• frontend/src/pages/Admin/AdminProductsPage.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.tsx
• frontend/src/pages/Admin/AdminProductsPage.test.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.test.tsx
Files Modified:
• frontend/src/App.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused existing /api/admin/products/ backend)
Frontend Pages Created:
• /admin/products — AdminProductsPage
• /admin/products/:productId — AdminProductDetailPage
Problems Encountered:
• None
Solutions Implemented:
• Mirrored admin categories/users patterns; multipart uploads via productsApi + apiClient FormData handling
Lessons Learned:
• Product create on list page; media uploads on detail page keeps forms manageable
Next Development Task:
• Public marketplace browse + product detail pages (React)
Date: 2026-07-20 (Admin Categories UI)
Working Hours:
Today's Objective: Admin Categories UI (React)
Modules Completed: categoriesApi client, admin list/create/detail pages, routes, dashboard link, tests
Files Created:
• frontend/src/api/categoriesApi.ts
• frontend/src/types/category.ts
• frontend/src/pages/Admin/AdminCategoriesPage.tsx
• frontend/src/pages/Admin/AdminCategoryDetailPage.tsx
• frontend/src/pages/Admin/AdminCategoriesPage.test.tsx
• frontend/src/pages/Admin/AdminCategoryDetailPage.test.tsx
Files Modified:
• frontend/src/App.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused existing /api/admin/categories/ backend)
Frontend Pages Created:
• /admin/categories — AdminCategoriesPage
• /admin/categories/:categoryId — AdminCategoryDetailPage
Problems Encountered:
• None
Solutions Implemented:
• Mirrored AdminUsersPage/AdminUserDetailPage patterns; TanStack Query + categoriesApi module
Lessons Learned:
• Parent category dropdown should exclude self on detail edit to avoid invalid hierarchy
Next Development Task:
• Admin Products UI (React)
Date: 2026-07-20 (Products)
Working Hours:
Today's Objective: Product CRUD Django app + admin wiring foundation
Modules Completed: Product / ProductImage / ProductFile models, public + admin APIs, image/file uploads, tests
Files Created:
• backend/products/ (models, services, serializers, views, urls, admin_urls, pagination, admin, storage, upload_rules, test_products.py)
• backend/products/migrations/0001_initial.py
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• backend/accounts/throttles.py
• PROJECT_STATUS.md
Database Changes:
• New tables: products, product_images, product_files
API Endpoints Added:
• GET /api/products/
• GET /api/products/<slug>/
• GET/POST /api/admin/products/
• GET/PATCH/DELETE /api/admin/products/<uuid>/
• POST /api/admin/products/<uuid>/images/
• DELETE /api/admin/products/<uuid>/images/<uuid>/
• POST /api/admin/products/<uuid>/files/
• DELETE /api/admin/products/<uuid>/files/<uuid>/
Frontend Pages Created:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused categories app patterns, IsAdministrator, log_admin_action, AvatarStorageService URL shape
Lessons Learned:
• Hide downloadable storage_path on public serializers until signed downloads exist
Next Development Task:
• Admin categories + products React UI, then public marketplace browse/detail pages
Date: 2026-07-17 (Categories)
Working Hours:
Today's Objective: Categories Django app
Modules Completed: Category model, public APIs, admin CRUD API, tests
Files Created:
• backend/categories/ (models, services, serializers, views, urls, admin_urls, pagination, admin, migration, test_categories.py)
• backend/categories/migrations/0001_initial.py
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• PROJECT_STATUS.md
Database Changes:
• New table: categories (UUID pk, name, slug, description, image, parent, is_active, timestamps)
API Endpoints Added:
• GET /api/categories/
• GET /api/categories/<slug>/
• GET/POST /api/admin/categories/
• GET/PATCH/DELETE /api/admin/categories/<uuid>/
Frontend Pages Created:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused IsAdministrator, AdminUserPagination pattern, log_admin_action
Lessons Learned:
• Parent/child hierarchy needs cycle checks before products attach
Next Development Task:
• Product CRUD Django app
Date: 2026-07-17 (PM)
Working Hours:
Today's Objective: Email verification
Modules Completed: Register/resend/confirm verification flow, customer login gate, frontend pages
Files Created:
• backend/accounts/test_email_verification.py
• frontend/src/pages/EmailVerification/EmailVerificationPage.tsx
• frontend/src/pages/EmailVerification/EmailVerificationResendPage.tsx
• frontend/src/pages/EmailVerification/useEmailVerification.ts
• frontend/src/pages/EmailVerification/useEmailVerificationResendForm.ts
• frontend/src/pages/EmailVerification/emailVerificationResendSchema.ts
Files Modified:
• backend/accounts/models.py
• backend/accounts/services.py
• backend/accounts/views.py
• backend/accounts/serializers.py
• backend/accounts/urls.py
• backend/accounts/throttles.py
• backend/accounts/security_log.py
• backend/accounts/admin_user_service.py
• backend/accounts/tests.py
• backend/accounts/test_admin_users.py
• backend/accounts/test_password_reset.py
• backend/accounts/test_avatar.py
• backend/accounts/test_throttling.py
• backend/accounts/test_admin_access.py
• backend/config/settings.py
• frontend/src/App.tsx
• frontend/src/api/authApi.ts
• frontend/src/types/auth.ts
• frontend/src/pages/Register/RegisterPage.tsx
• frontend/src/pages/Login/LoginPage.tsx
• frontend/src/pages/Login/useLoginForm.ts
• frontend/src/test/test-utils.ts
• PROJECT_STATUS.md
Database Changes:
• None (reused existing users.email_verified column)
API Endpoints Added:
• POST /api/auth/email-verification/resend/
• POST /api/auth/email-verification/confirm/
API Endpoints Modified:
• POST /api/auth/register/ — sends verification email
• POST /api/auth/login/ — returns 403 email_not_verified for unverified customers
Frontend Pages Created:
• /verify-email/:uid/:token — EmailVerificationPage
• /verify-email/resend — EmailVerificationResendPage
Frontend Pages Modified:
• /register — success message prompts email verification
• /login — resend link when email not verified
Problems Encountered:
• None
Solutions Implemented:
• Reused PasswordResetService uid decoding + email link pattern; dedicated EmailVerificationTokenGenerator
Lessons Learned:
• Separate token generator salt prevents cross-feature token reuse
Next Development Task:
• Categories Django app + admin CRUD
Date: 2026-07-17
Working Hours:
Today's Objective: Password reset (verify + harden)
Modules Completed: Password reset session invalidation, confirm throttling, security logging
Files Created:
• None (feature already existed; Definition_of_Done.md populated)
Files Modified:
• backend/accounts/services.py
• backend/accounts/views.py
• backend/accounts/throttles.py
• backend/accounts/security_log.py
• backend/accounts/test_password_reset.py
• backend/accounts/tests.py
• backend/config/settings.py
• .cursor/Definition_of_Done.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (existing endpoints hardened)
API Endpoints Modified:
• POST /api/auth/password-reset/confirm/ — rate-limited (10/hour); blacklists refresh tokens
• POST /api/auth/change-password/ — blacklists outstanding refresh tokens after success
Frontend Pages Created:
• None (existing /forgot-password and /reset-password/:uid/:token unchanged)
Problems Encountered:
• None
Solutions Implemented:
• Reused PasswordResetService; added blacklist_all_refresh_tokens + log_password_reset
Lessons Learned:
• Password reset was already complete; hardening closed the session-reuse gap
Next Development Task:
• Email verification
Date: 2026-07-15
Working Hours:
Today's Objective: Admin user CRUD
Modules Completed: Admin users list/create/update/deactivate
Files Created:
• backend/accounts/admin_user_service.py
• backend/accounts/pagination.py
• backend/accounts/test_admin_users.py
• frontend/src/pages/Admin/AdminUsersPage.tsx
• frontend/src/pages/Admin/AdminUserDetailPage.tsx
Files Modified:
• backend/accounts/serializers.py
• backend/accounts/views.py
• backend/accounts/urls.py
• frontend/src/api/authApi.ts
• frontend/src/types/auth.ts
• frontend/src/App.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• GET/POST /api/auth/admin/users/
• GET/PATCH/DELETE /api/auth/admin/users/<uuid>/
Frontend Pages Created:
• /admin/users — AdminUsersPage
• /admin/users/:userId — AdminUserDetailPage
Problems Encountered:
• None
Solutions Implemented:
• AdminUserService with self/last-admin safeguards; reuse IsAdministrator
Lessons Learned:
• Soft-delete is safer than hard delete for marketplace accounts
Next Development Task:
• Categories Django app + admin CRUD
Date: 2026-09-09
Working Hours:
Today's Objective: Custom Projects landing page visual polish
Modules Completed: Custom Projects hero, process cards, and request-type card grid
Files Created:
• frontend/public/images/custom-projects-hero.jpg
Files Modified:
• frontend/src/pages/CustomProjects/CustomProjectsLandingPage.tsx
• frontend/src/styles/marketing.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Modified:
• /custom-projects — redesigned hero, “How it works,” and “What you can request” sections
Verification:
• CustomProjectsLandingPage focused tests passed (3/3)
• Frontend lint and production build passed
• Security review found no medium, high, or critical issues
Problems Encountered:
• Wide process-card row initially expanded the constrained parent grid and required independent centering
Solutions Implemented:
• Reused the existing page-scoped card/icon patterns and centered full-width row technique
Lessons Learned:
• Oversized grid children should remain min-width: 0 and center their internal row independently
Next Development Task:
• Continue manager-approved Custom Projects page polish
Date: 2026-09-09
Working Hours:
Today's Objective: Marketplace home module cards below the hero banner
Modules Completed: Three-card marketplace navigation section visual redesign
Files Created:
• None
Files Modified:
• frontend/src/pages/Products/ProductsBrowsePage.tsx
• frontend/src/pages/Products/ProductsBrowsePage.test.tsx
• frontend/src/styles/products-browse.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None
Frontend Pages Modified:
• /products — redesigned 3D Models, Plugins & Tools, and Inquiry Portal cards
Verification:
• ProductsBrowsePage focused tests passed (7/7)
• Frontend lint passed with two pre-existing Fast Refresh warnings outside touched files
• Frontend production build passed
• Security checklist manually reviewed; presentation-only changes add no input, networking, or HTML injection
Risks or Blockers:
• Automated security review could not complete after two attempts because its connection was interrupted
Solutions Implemented:
• Reused existing semantic articles, React Router links, and XSS-safe inline SVG markup
Lessons Learned:
• The existing module structure supported the approved design without adding another component
Next Development Task:
• Visually confirm the section at target desktop and mobile viewport sizes
Date: 2026-09-09
Working Hours:
Today's Objective: Explore 3D Categories visual redesign
Modules Completed: Backend-driven responsive category image grid
Files Created:
• None
Files Modified:
• frontend/src/pages/Products/ProductsBrowsePage.tsx
• frontend/src/pages/Products/ProductsBrowsePage.test.tsx
• frontend/src/styles/products-browse.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None; reused GET /api/categories/
Frontend Pages Modified:
• /products — Explore 3D Categories grid
Verification:
• ProductsBrowsePage focused tests passed (8/8)
• Frontend lint passed with two pre-existing Fast Refresh warnings outside touched files
• Frontend production build passed
Security:
• Category names remain escaped React text; image URLs still come from the existing public category API
Risks or Blockers:
• Categories without backend images use the existing gradient fallback
Next Development Task:
• Continue manager-approved marketplace home polish
Date: 2026-09-09
Working Hours:
Today's Objective: Match the approved marketplace home mock (hero + service cards)
Modules Completed: Centered hero with trending tags and sort pills; three-column service strip
Files Created:
• None
Files Modified:
• frontend/src/components/MarketplaceHero.tsx
• frontend/src/styles/home.css
• frontend/src/pages/Products/ProductsBrowsePage.tsx
• frontend/src/pages/Products/ProductsBrowsePage.test.tsx
• frontend/src/styles/products-browse.css
• frontend/src/pages/Models/ModelsBrowsePage.tsx
• frontend/src/pages/Models/ModelsBrowsePage.test.tsx
• backend/products/services.py
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added, Modified, or Removed:
• None; public product list ordering now also accepts total_downloads and review_count
Frontend Pages Modified:
• /products — hero and service cards under the header
• /3d-models — honors ordering query from the home sort pills
Verification:
• ProductsBrowsePage and ModelsBrowsePage focused tests passed (20/20)
• oxlint passed on touched frontend source files
Security:
• Search queries remain length-capped; sort values are allowlisted on the backend and frontend
• Card copy and trending labels are static React text, not HTML
Risks or Blockers:
• Browser interaction tools were not available; visual check should be confirmed at desktop and mobile viewports
Next Development Task:
• Visually confirm the hero and service strip against the approved mock
Deployment Checklist
• [ ] Backend Stable (formal production sign-off)
• [ ] Frontend Stable (formal production sign-off)
• [ ] Database Stable (formal production sign-off)
• [ ] Payments Tested (formal production sign-off; Stripe flows + unit/API tests exist)
• [x] Downloads Tested (unit/API + R2 signed path covered)
• [ ] Security Reviewed (runbook: docs/PRODUCTION_CHECKLIST.md §5; live review still open)
• [x] Docker Ready (Feature 13)
• [ ] Production Ready (checklist documented; host cutover open — docs/PRODUCTION_CHECKLIST.md)
Final Release Checklist
• [x] Marketplace Complete
• [x] Plugin Store Complete (R2 signed downloads when private object exists)
• [x] Custom Project Portal Complete (incl. Feature 15G quotation pay)
• [x] Customer Dashboard Complete
• [x] Admin Dashboard Complete (payments UI + analytics + QA queue)
• [x] Payment System Complete (Stripe cart + webhooks + Feature 15G)
• [x] Secure Downloads Complete (R2 presigned JSON + local FileResponse fallback)
• [x] Invoice PDF Complete (customer/admin download + receipt email)
• [x] Cloudflare R2 + batch ingest complete in marketplace repo (Features 14 / 14B / 16 Phases 3–10)
• [ ] Security Testing Complete
• [x] Performance Optimization Complete (code-level pass 2026-09-16; formal load testing still open)
• [ ] Production Deployment Complete (operator runbook: docs/PRODUCTION_CHECKLIST.md)
• [x] Feature 13 Docker / Gunicorn / Nginx stack
Project Completion
Current Completion Percentage: ~85%
Estimated Remaining Work: Execute production checklist on live/staging host, public polish (legal pages, fullscreen, search extras), catalog-bridge .exe polish (separate repo), optional activity-log UI / product tags
Expected Production Release Date: ____
Notes
UI prototype redesign is paused pending manager approval. Continue feature work on current UI.
Code scan 2026-09-16: outdated “R2/batch planned / ~70%” checklist blocks reconciled to match codebase.
Feature 10 In-app Notifications shipped 2026-08-03 (Feature 11 analytics already complete).

Date: 2026-07-24 (CP-MSG-05 Admin project messages UI)
Working Hours:
Today's Objective: Admin project messages UI on /admin/projects/:projectId
Modules Completed: Admin messages API client, Messages section (separated from Admin notes), chronological You/Customer thread, reply composer with loading/empty/error, tests
Files Created:
• frontend/src/pages/Admin/AdminProjectMessagesSection.tsx
• frontend/src/pages/Admin/AdminProjectMessagesSection.test.tsx
Files Modified:
• frontend/src/api/customProjectsApi.ts
• frontend/src/api/customProjectsApi.test.ts
• frontend/src/pages/Admin/AdminProjectDetailPage.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.test.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET/POST /api/admin/custom-projects/<uuid>/messages/)
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• /admin/projects/:projectId — Messages section (thread, empty/loading/error, reply composer)
Problems Encountered:
• None
Solutions Implemented:
• Mirrored CustomerProjectMessagesSection patterns with admin API + You/Customer labels
• Visual separation via dedicated section + hint text + border-top (Admin notes remain in review form)
Verification:
• AdminProjectMessagesSection + AdminProjectDetailPage + customProjectsApi tests: 22/22 passed
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint: clean
Security Review:
• No medium, high, or critical issues found
• Page remains behind AdminRoute; messages API requires IsAdministrator
• API calls via customProjectsApi (authenticated apiClient); no Axios in components
• Message body rendered as text nodes only (XSS-safe); no dangerouslySetInnerHTML
• Client trim/empty/max-length checks; server remains source of truth for validation/throttle
• Admin notes stay on project update form and are not mixed into the customer-visible message thread
Next Development Task:
• Customer reference upload UI, or quote approval (Client Approval), or public product details page
Date: 2026-07-24 (CP-MSG-04 verification)
Working Hours:
Today's Objective: Confirm customer project messages UI meets requirements; no new code required
Modules Completed: Re-verified thread load/render, composer send success/failure, empty state, XSS-safe text rendering
Files Created:
• None
Files Modified:
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• None (existing CustomerProjectMessagesSection on project detail)
Problems Encountered:
• None — feature already implemented on feature/custom-project-messages-backend
Solutions Implemented:
• N/A (verification only)
Verification:
• CustomerProjectMessagesSection + CustomerProjectDetailPage + customProjectsApi tests: 36/36 passed
• oxlint: clean; tsc --noEmit: 0 errors
Security Review:
• No medium, high, or critical issues found
• Reconfirmed: text-only body render, API via customProjectsApi, ownership gated by detail + ProtectedRoute, client max-length + server validation/throttle
Next Development Task:
• CP-MSG-05 Admin project messages UI
Date: 2026-07-23 (CP-MSG-04 Customer project messages UI)
Working Hours:
Today's Objective: Customer project messages UI
Modules Completed: Messages section on customer project detail, list/create API client, chronological You/Studio thread, composer with submit/error states, tests
Files Created:
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.tsx
• frontend/src/pages/Dashboard/CustomerProjectMessagesSection.test.tsx
Files Modified:
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/api/customProjectsApi.test.ts
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.test.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET/POST /api/custom-projects/<uuid>/messages/)
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• Customer project detail — Messages section (thread, empty state, composer, loading/error)
Problems Encountered:
• None
Solutions Implemented:
• Reused existing customer messages API, TanStack Query, Alert/ErrorState/Spinner/FormField patterns
• Sender label from current user id (You) vs other senders (Studio); body rendered as React text (XSS-safe)
Verification:
• CustomerProjectMessagesSection tests: 5/5 passed (thread labels, empty, send success, send failure, XSS text)
• CustomerProjectDetailPage tests: still passing with messages mocked
• customProjectsApi message client tests: passed
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• Messages load/send only after project detail succeeds (ownership already gated by detail API + ProtectedRoute)
• API calls via customProjectsApi (authenticated apiClient); no Axios in components
• Message body rendered as text nodes only (no dangerouslySetInnerHTML); HTML payloads stay escaped
• Client trims/validates empty + max length; server remains source of truth for validation/throttle
• Sender email not exposed (matches public message serializer)
Next Development Task:
• CP-MSG-05 Admin project messages UI (or customer reference upload / quote approval)
Date: 2026-07-23 (CP-MSG-03 Customer project detail UI)
Working Hours:
Today's Objective: Customer project detail UI
Modules Completed: Protected customer project detail page, quotation display, reference file list, loading/404/error states, tests
Files Created:
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.test.tsx
Files Modified:
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET /api/custom-projects/<uuid>/)
API Endpoints Modified:
• None
Frontend Pages Created/Updated:
• /dashboard/projects/:projectId — full customer project detail (title, description, status, payment status, deadline, category, budget, quotation block, reference files; loading / 404-or-forbidden / error+retry; back link to My Projects)
Problems Encountered:
• Query-level retry overrode the test client's retry:false and hid the recoverable error state
Solutions Implemented:
• Disabled auto-retry on detail query; 404/403 show not-found without Retry; recoverable errors use Retry button
• Reused getCustomerCustomProject, ProtectedRoute, ErrorState/Spinner, admin-media file list styles, formatFileSize
Verification:
• CustomerProjectDetailPage tests: 5/5 passed (happy path, empty quote/files, 404, error/retry, back link)
• MyProjectsPage tests: 7/7 passed
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• Route gated by ProtectedRoute (JWT session required)
• Ownership enforced server-side (404 for other customers); UI treats 404/403 as not-found without leaking existence details beyond API message
• No Axios in components; API via customProjectsApi; React text rendering for user-generated title/description/notes/file names
• Customer file list uses public metadata only (no download_url / storage_path)
• Approve/reject quotation and file upload UI intentionally out of scope
Next Development Task:
• CP-MSG-04 Customer project messages UI (thread on detail page)
Date: 2026-07-23 (CP-MSG-02 Customer My Projects list UI)
Working Hours:
Today's Objective: Customer My Projects list UI
Modules Completed: Customer custom-projects API client, My Projects list page, protected routes, nav/dashboard links, basic customer project detail shell, tests
Files Created:
• frontend/src/pages/Dashboard/MyProjectsPage.tsx
• frontend/src/pages/Dashboard/MyProjectsPage.test.tsx
• frontend/src/pages/Dashboard/CustomerProjectDetailPage.tsx
Files Modified:
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/App.tsx
• frontend/src/components/Navbar.tsx
• frontend/src/components/Navbar.test.tsx
• frontend/src/pages/Dashboard/DashboardPage.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused GET /api/custom-projects/ and GET /api/custom-projects/<uuid>/)
API Endpoints Modified:
• None
Frontend Pages Created:
• /dashboard/projects — My Projects list (title, status, updated date, quote amount; loading/empty/error; row → detail)
• /dashboard/projects/:projectId — basic customer project detail shell (title, status, description, quote)
Problems Encountered:
• List API exposes quotation_amount but not quotation status; quote column shows amount when present
Solutions Implemented:
• Reused ProtectedRoute, customProjectsApi module pattern, TanStack Query, AdminProjectsPage table/loading/error patterns, Spinner/ErrorState
Verification:
• MyProjectsPage tests: 7/7 passed (list, quote dash, navigation, empty, page recovery, error/retry)
• TypeScript check (`tsc --noEmit`): 0 errors
• oxlint on touched files: clean
Security Review:
• No medium, high, or critical issues found
• List/detail routes gated by ProtectedRoute (JWT session required)
• API client reuses authenticated apiClient; ownership enforced server-side (404 for other customers)
• No Axios calls in components; user-generated titles rendered via React text nodes
• Admin users do not see My Projects nav link
• Real-world hardening: empty later-page auto-recovery; title uses real Link (open in new tab)
Next Development Task:
• CP-MSG-03 Customer project detail UI (fields, quote display, reference files, states)
Date: 2026-07-23 (CP-MSG-01 Project messages backend)
Working Hours:
Today's Objective: Project messages backend (API + model)
Modules Completed: ProjectMessage model, customer/admin list+create APIs, validation, pagination, create throttles, ownership/RBAC, admin security logging, tests
Files Created:
• backend/custom_projects/migrations/0002_project_messages.py
Files Modified:
• backend/custom_projects/models.py
• backend/custom_projects/services.py
• backend/custom_projects/serializers.py
• backend/custom_projects/views.py
• backend/custom_projects/urls.py
• backend/custom_projects/admin_urls.py
• backend/custom_projects/admin.py
• backend/custom_projects/test_custom_projects.py
• PROJECT_STATUS.md
Database Changes:
• New table: custom_project_messages (UUID pk, project FK, sender FK, body, created_at, updated_at; indexes on created_at and project+created_at)
API Endpoints Added:
• GET/POST /api/custom-projects/<uuid>/messages/
• GET/POST /api/admin/custom-projects/<uuid>/messages/
API Endpoints Modified:
• None
Frontend Pages Created:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused CustomProjectService ownership helpers, CustomProjectPagination, existing write throttles, log_admin_action, and nested file-upload view patterns
Verification:
• custom_projects tests: 15/15 passed
Security Review:
• No medium, high, or critical issues found
• Customer message routes resolve project via get_for_customer (other owners → 404)
• Admin message routes require IsAdministrator
• Message serializers never include admin_notes
• Create endpoints rate-limited; admin creates logged as custom_project_message_create
Next Development Task:
• CP-MSG-02 Customer My Projects list UI
Date: 2026-07-22 (Public Products Browse Page)
Working Hours:
Today's Objective: Public products Browse Page (/products)
Modules Completed: Public product/category API clients, ProductCard component, ProductsBrowsePage, CSS styling, tests, routing & navigation
Files Created:
• frontend/src/pages/Products/ProductCard.tsx
• frontend/src/pages/Products/ProductsBrowsePage.tsx
• frontend/src/pages/Products/ProductsBrowsePage.test.tsx
• frontend/src/styles/products-browse.css
Files Modified:
• frontend/src/types/product.ts
• frontend/src/types/category.ts
• frontend/src/api/productsApi.ts
• frontend/src/api/categoriesApi.ts
• frontend/src/App.tsx
• frontend/src/components/Navbar.tsx
• frontend/src/pages/Home/HomePage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• Reused GET /api/products/ and GET /api/categories/
Frontend Pages Created:
• /products (and /Products) — Public Products Browse Page with hero, debounced search, category filter, license filter, sorting, pagination, skeletal loading, error retry, and empty state
Verification:
• Full frontend test suite: 90/90 passed
• Full backend test suite (products & categories): 16/16 passed
• Frontend TypeScript build (`npm run build`): 0 errors
• Frontend linter (`oxlint`): 0 warnings, 0 errors
Security Review:
• Public serializer hides backend `storage_path` and sensitive metadata
• React JSX sanitizes rendering against XSS
• Input sanitized and debounced client-side before API calls
Date: 2026-07-22 (Custom Projects admin)
Working Hours:
Today's Objective: Custom Projects administrator management (Feature 8)
Modules Completed: custom_projects Django app, customer request APIs, admin review/quote APIs, admin UI list/detail, dashboard project stats, tests
Files Created:
• backend/custom_projects/ (models, services, serializers, views, urls, admin_urls, storage, upload_rules, pagination, admin, migration, tests)
• frontend/src/types/customProject.ts
• frontend/src/api/customProjectsApi.ts
• frontend/src/pages/Admin/AdminProjectsPage.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.tsx
• frontend/src/pages/Admin/AdminProjectsPage.test.tsx
• frontend/src/pages/Admin/AdminProjectDetailPage.test.tsx
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• backend/accounts/throttles.py
• backend/analytics/services.py
• backend/analytics/test_dashboard_stats.py
• frontend/src/App.tsx
• frontend/src/config/adminNav.ts
• frontend/src/layouts/AdminLayout.test.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• PROJECT_STATUS.md
Database Changes:
• New tables: custom_projects, custom_project_files, custom_project_quotations
API Endpoints Added:
• GET/POST /api/custom-projects/
• GET /api/custom-projects/<uuid>/
• POST /api/custom-projects/<uuid>/files/
• GET/POST /api/admin/custom-projects/
• GET/PATCH /api/admin/custom-projects/<uuid>/
• POST /api/admin/custom-projects/<uuid>/quotation/
API Endpoints Modified:
• GET /api/admin/dashboard/stats/ — custom project pending/live/completed counts are live
Frontend Pages Created:
• /admin/projects — list/create with search, status/payment filters, ordering, pagination
• /admin/projects/:projectId — review, assign designer, update status/notes, set quotation, view reference files
Problems Encountered:
• None blocking
Solutions Implemented:
• Reused products/plugins admin patterns, IsAdministrator, log_admin_action, pagination, storage, and upload validation patterns
• Enforced custom-project status transitions in the service layer
Verification:
• custom_projects + dashboard stats backend: 9/9 tests passed
• Frontend project admin tests: 4/4 passed
• Frontend lint (oxlint): passed
Security Review:
• No medium, high, or critical issues found
• Admin routes remain protected by AdminRoute and backend IsAdministrator
• Customer project detail is ownership-scoped; other customers receive 404
• Customer file responses omit storage_path; upload MIME/extension/size validated server-side
• Admin write endpoints throttled (admin_custom_project_write / custom_project_write)
• Admin create/update/quotation actions logged via log_admin_action
Next Development Task:
• Customer My Projects UI (list/detail, reference upload UI, quote approval)
Date: 2026-07-21 (Plugins admin UI)
Working Hours:
Today's Objective: Plugins administrator UI (Feature 7)
Modules Completed: Plugin and plugin-category types/API client, plugin CRUD UI, filters/ordering/pagination, media management, plugin-category management, admin navigation/dashboard wiring, tests
Files Created:
• frontend/src/types/plugin.ts
• frontend/src/api/pluginsApi.ts
• frontend/src/lib/pluginUpload.ts
• frontend/src/pages/Admin/AdminPluginsPage.tsx
• frontend/src/pages/Admin/AdminPluginDetailPage.tsx
• frontend/src/pages/Admin/PluginMediaSection.tsx
• frontend/src/pages/Admin/AdminPluginCategoriesPage.tsx
• frontend/src/pages/Admin/AdminPluginCategoryDetailPage.tsx
• frontend/src/pages/Admin/AdminPluginsPage.test.tsx
• frontend/src/pages/Admin/AdminPluginDetailPage.test.tsx
• frontend/src/pages/Admin/PluginMediaSection.test.tsx
• frontend/src/pages/Admin/AdminPluginCategoriesPage.test.tsx
• frontend/src/pages/Admin/AdminPluginCategoryDetailPage.test.tsx
• frontend/src/api/pluginsApi.test.ts
• frontend/src/hooks/useDebouncedValue.ts
• frontend/src/hooks/useDebouncedValue.test.ts
Files Modified:
• frontend/src/App.tsx
• frontend/src/config/adminNav.ts
• frontend/src/layouts/AdminLayout.test.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/pages/Admin/AdminDashboardPage.test.tsx
• frontend/src/pages/Admin/ProductMediaSection.test.tsx
• frontend/src/pages/EmailVerification/useEmailVerification.ts
• backend/config/settings.py
• backend/plugins/services.py
• backend/plugins/serializers.py
• backend/plugins/views.py
• backend/plugins/test_plugins.py
• backend/requirements.txt
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused existing plugin administrator APIs)
Frontend Pages Created:
• /admin/plugins — list/create with search, status/category filters, ordering, and pagination
• /admin/plugins/:pluginId — edit/archive and image/package management
• /admin/plugin-categories — list/create/filter/pagination
• /admin/plugin-categories/:categoryId — edit/deactivate
Problems Encountered:
• Existing unused import in ProductMediaSection.test.tsx blocked TypeScript production build
• Backend dependency audit found known vulnerabilities in Pillow 11.3.0
• Public plugin lists loaded image/file collections that their serializer does not return
• Plugin-admin rate limiting and package MIME/size limits lacked direct regression tests
• Media query refreshes could overwrite unsaved plugin form changes
• Category selectors stopped after 100 records and search issued one request per keystroke
• Admin plugin lists fetched detail-only media and package storage URLs were exposed to the UI
Solutions Implemented:
• Reused product/category admin architecture and media UI patterns; removed the stale test import
• Upgraded Pillow to 12.3.0; final pip-audit reports no known vulnerabilities
• Removed unused public-list media prefetches and added a constant-query-count test
• Added plugin throttle, package MIME/size, and backend CSP regression assertions
• Lazy-loaded plugin admin pages, reducing the entry bundle below the warning threshold
• Initialized edit forms once per plugin, removed stale thumbnail/category updates, and added a media-refresh regression test
• Loaded every category page, debounced search, and eliminated duplicate/before-redirect refetches
• Added a lightweight admin-list serializer/query, removed package storage paths from API/UI, and validated each upload once
Verification:
• Plugin-focused frontend: 15/15 selected follow-up tests passed
• Full frontend: 79/79 tests passed
• Frontend lint: passed with no warnings
• Frontend production build: passed; entry bundle is 490.48 kB
• Plugin backend: 25/25 tests passed
• Full backend: 120/120 tests passed
• npm audit: 0 vulnerabilities
• pip-audit: no known vulnerabilities
• Django deployment checks and migration drift checks passed
Security Review:
• No medium, high, or critical issues found
• Admin routes remain protected by AdminRoute and backend IsAdministrator
• Frontend upload checks are UX validation; backend remains authoritative for MIME, signature, size, and archive metadata validation
• Backend CSP is enforced; frontend-host CSP remains a deployment/CDN responsibility
• Package storage URLs are no longer returned or rendered; authenticated entitlement-based downloads are still required before a public paid-download flow
Next Development Task:
• Public plugin store listing and detail UI
Date: 2026-07-21 (Plugins backend)
Working Hours:
Today's Objective: Plugin catalog Django app (Feature 6)
Modules Completed: PluginCategory, Plugin, PluginImage, PluginFile, public/admin APIs, uploads, tests
Files Created:
• backend/plugins/ (models, services, serializers, views, URLs, storage, upload rules, admin, pagination, migration, tests)
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• backend/accounts/throttles.py
• backend/analytics/services.py
• backend/analytics/test_dashboard_stats.py
• PROJECT_STATUS.md
Database Changes:
• New tables: plugin_categories, plugins, plugin_images, plugin_files
• Database constraints: valid pricing/rating ranges and one primary image/file per plugin
API Endpoints Added:
• GET /api/plugin-categories/
• GET /api/plugin-categories/<slug>/
• GET /api/plugins/
• GET /api/plugins/<slug>/
• GET/POST /api/admin/plugin-categories/
• GET/PATCH/DELETE /api/admin/plugin-categories/<uuid>/
• GET/POST /api/admin/plugins/
• GET/PATCH/DELETE /api/admin/plugins/<uuid>/
• POST /api/admin/plugins/<uuid>/images/
• DELETE /api/admin/plugins/<uuid>/images/<uuid>/
• POST /api/admin/plugins/<uuid>/files/
• DELETE /api/admin/plugins/<uuid>/files/<uuid>/
API Endpoints Modified:
• GET /api/admin/dashboard/stats/ — plugin total is now live
Frontend Pages Modified:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused product/category service, serializer, permission, pagination, logging, storage, and upload patterns
• Added archive signature checks plus ZIP path traversal, symlink, encryption, entry count, and expansion limits
Verification:
• Plugin backend: 18/18 tests passed
• Full backend: 115/115 tests passed
• Full frontend: 64/64 tests passed
• Django checks and migration drift checks passed
Security Review:
• No medium, high, or critical issues found
Next Development Task:
• Plugins admin UI (Feature 7)
Date: 2026-07-20 (Product management polish)
Working Hours:
Today's Objective: USDZ upload support + improved admin product media UX (Feature 3)
Modules Completed: upload_rules USDZ, ProductMediaSection component, format helpers, tests
Files Created:
• frontend/src/lib/productUpload.ts
• frontend/src/lib/productUpload.test.ts
• frontend/src/pages/Admin/ProductMediaSection.tsx
• frontend/src/pages/Admin/ProductMediaSection.test.tsx
Files Modified:
• backend/products/upload_rules.py
• backend/products/test_products.py
• frontend/src/pages/Admin/AdminProductDetailPage.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.test.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (extended existing product file upload validation)
API Endpoints Modified:
• POST /api/admin/products/<uuid>/files/ — now accepts .usdz (model/vnd.usdz+zip)
Frontend Pages Modified:
• /admin/products/:productId — polished images/files upload section with drag-and-drop, badges, thumbnails
Problems Encountered:
• None
Solutions Implemented:
• Extracted ProductMediaSection; shared productUpload constants mirror backend rules
Lessons Learned:
• Primary image upload already sets thumbnail server-side; UI now explains that clearly
Next Development Task:
• Plugins backend (Feature 6)
Date: 2026-07-20 (Admin home dashboard stats)
Working Hours:
Today's Objective: Admin home dashboard with real stats (Feature 2)
Modules Completed: analytics app, dashboard stats API, AdminDashboardPage stats UI, tests
Files Created:
• backend/analytics/ (services, serializers, views, admin_urls, test_dashboard_stats.py)
• frontend/src/api/dashboardApi.ts
• frontend/src/types/dashboard.ts
• frontend/src/pages/Admin/AdminDashboardPage.test.tsx
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/styles/admin-layout.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• GET /api/admin/dashboard/stats/
Frontend Pages Modified:
• /admin — AdminDashboardPage now shows stat cards and live category breakdown
Problems Encountered:
• None
Solutions Implemented:
• New analytics app aggregates users/products/categories with efficient Count queries; placeholders for plugins/projects/sales until those modules ship
Lessons Learned:
• Category breakdown uses distinct Count to avoid duplicate rows from published filter joins
Next Development Task:
• Product management polish — USDZ support and upload UX (Feature 3)
Date: 2026-07-20 (Admin layout & navigation)
Working Hours:
Today's Objective: Admin layout & navigation (Feature 1)
Modules Completed: AdminLayout shell, sidebar nav, header, mobile menu, useAdminSession hook, tests
Files Created:
• frontend/src/layouts/AdminLayout.tsx
• frontend/src/layouts/AdminLayout.test.tsx
• frontend/src/hooks/useAdminSession.ts
• frontend/src/config/adminNav.ts
• frontend/src/styles/admin-layout.css
Files Modified:
• frontend/src/routes/AdminRoute.tsx
• frontend/src/routes/AdminRoute.test.tsx
• frontend/src/App.tsx
• frontend/src/index.css
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/pages/Admin/AdminCategoriesPage.tsx
• frontend/src/pages/Admin/AdminProductsPage.tsx
• frontend/src/pages/Admin/AdminUsersPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None
Frontend Pages Created:
• None (layout wraps existing /admin/* routes)
Frontend Components Added:
• AdminLayout (sidebar + header shell for all admin routes except /admin/login)
Problems Encountered:
• None
Solutions Implemented:
• Centralized admin session verification and sign-out in useAdminSession; hid public Navbar on admin routes
Lessons Learned:
• Future admin sections (Plugins, Projects, Analytics) can be enabled in adminNav.ts as modules ship
Next Development Task:
• Admin home dashboard with real stats (Feature 2)
Date: 2026-07-20 (Admin Products UI)
Working Hours:
Today's Objective: Admin Products UI (React)
Modules Completed: productsApi client, admin list/create/detail pages, image/file uploads, routes, dashboard link, tests
Files Created:
• frontend/src/api/productsApi.ts
• frontend/src/types/product.ts
• frontend/src/pages/Admin/AdminProductsPage.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.tsx
• frontend/src/pages/Admin/AdminProductsPage.test.tsx
• frontend/src/pages/Admin/AdminProductDetailPage.test.tsx
Files Modified:
• frontend/src/App.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused existing /api/admin/products/ backend)
Frontend Pages Created:
• /admin/products — AdminProductsPage
• /admin/products/:productId — AdminProductDetailPage
Problems Encountered:
• None
Solutions Implemented:
• Mirrored admin categories/users patterns; multipart uploads via productsApi + apiClient FormData handling
Lessons Learned:
• Product create on list page; media uploads on detail page keeps forms manageable
Next Development Task:
• Public marketplace browse + product detail pages (React)
Date: 2026-07-20 (Admin Categories UI)
Working Hours:
Today's Objective: Admin Categories UI (React)
Modules Completed: categoriesApi client, admin list/create/detail pages, routes, dashboard link, tests
Files Created:
• frontend/src/api/categoriesApi.ts
• frontend/src/types/category.ts
• frontend/src/pages/Admin/AdminCategoriesPage.tsx
• frontend/src/pages/Admin/AdminCategoryDetailPage.tsx
• frontend/src/pages/Admin/AdminCategoriesPage.test.tsx
• frontend/src/pages/Admin/AdminCategoryDetailPage.test.tsx
Files Modified:
• frontend/src/App.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (reused existing /api/admin/categories/ backend)
Frontend Pages Created:
• /admin/categories — AdminCategoriesPage
• /admin/categories/:categoryId — AdminCategoryDetailPage
Problems Encountered:
• None
Solutions Implemented:
• Mirrored AdminUsersPage/AdminUserDetailPage patterns; TanStack Query + categoriesApi module
Lessons Learned:
• Parent category dropdown should exclude self on detail edit to avoid invalid hierarchy
Next Development Task:
• Admin Products UI (React)
Date: 2026-07-20 (Products)
Working Hours:
Today's Objective: Product CRUD Django app + admin wiring foundation
Modules Completed: Product / ProductImage / ProductFile models, public + admin APIs, image/file uploads, tests
Files Created:
• backend/products/ (models, services, serializers, views, urls, admin_urls, pagination, admin, storage, upload_rules, test_products.py)
• backend/products/migrations/0001_initial.py
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• backend/accounts/throttles.py
• PROJECT_STATUS.md
Database Changes:
• New tables: products, product_images, product_files
API Endpoints Added:
• GET /api/products/
• GET /api/products/<slug>/
• GET/POST /api/admin/products/
• GET/PATCH/DELETE /api/admin/products/<uuid>/
• POST /api/admin/products/<uuid>/images/
• DELETE /api/admin/products/<uuid>/images/<uuid>/
• POST /api/admin/products/<uuid>/files/
• DELETE /api/admin/products/<uuid>/files/<uuid>/
Frontend Pages Created:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused categories app patterns, IsAdministrator, log_admin_action, AvatarStorageService URL shape
Lessons Learned:
• Hide downloadable storage_path on public serializers until signed downloads exist
Next Development Task:
• Admin categories + products React UI, then public marketplace browse/detail pages
Date: 2026-07-17 (Categories)
Working Hours:
Today's Objective: Categories Django app
Modules Completed: Category model, public APIs, admin CRUD API, tests
Files Created:
• backend/categories/ (models, services, serializers, views, urls, admin_urls, pagination, admin, test_categories.py)
• backend/categories/migrations/0001_initial.py
Files Modified:
• backend/config/settings.py
• backend/config/urls.py
• PROJECT_STATUS.md
Database Changes:
• New table: categories (UUID pk, name, slug, description, image, parent, is_active, timestamps)
API Endpoints Added:
• GET /api/categories/
• GET /api/categories/<slug>/
• GET/POST /api/admin/categories/
• GET/PATCH/DELETE /api/admin/categories/<uuid>/
Frontend Pages Created:
• None (backend-only task)
Problems Encountered:
• None
Solutions Implemented:
• Reused IsAdministrator, AdminUserPagination pattern, log_admin_action
Lessons Learned:
• Parent/child hierarchy needs cycle checks before products attach
Next Development Task:
• Product CRUD Django app
Date: 2026-07-17 (PM)
Working Hours:
Today's Objective: Email verification
Modules Completed: Register/resend/confirm verification flow, customer login gate, frontend pages
Files Created:
• backend/accounts/test_email_verification.py
• frontend/src/pages/EmailVerification/EmailVerificationPage.tsx
• frontend/src/pages/EmailVerification/EmailVerificationResendPage.tsx
• frontend/src/pages/EmailVerification/useEmailVerification.ts
• frontend/src/pages/EmailVerification/useEmailVerificationResendForm.ts
• frontend/src/pages/EmailVerification/emailVerificationResendSchema.ts
Files Modified:
• backend/accounts/models.py
• backend/accounts/services.py
• backend/accounts/views.py
• backend/accounts/serializers.py
• backend/accounts/urls.py
• backend/accounts/throttles.py
• backend/accounts/security_log.py
• backend/accounts/admin_user_service.py
• backend/accounts/tests.py
• backend/accounts/test_admin_users.py
• backend/accounts/test_password_reset.py
• backend/accounts/test_avatar.py
• backend/accounts/test_throttling.py
• backend/accounts/test_admin_access.py
• backend/config/settings.py
• frontend/src/App.tsx
• frontend/src/api/authApi.ts
• frontend/src/types/auth.ts
• frontend/src/pages/Register/RegisterPage.tsx
• frontend/src/pages/Login/LoginPage.tsx
• frontend/src/pages/Login/useLoginForm.ts
• frontend/src/test/test-utils.ts
• PROJECT_STATUS.md
Database Changes:
• None (reused existing users.email_verified column)
API Endpoints Added:
• POST /api/auth/email-verification/resend/
• POST /api/auth/email-verification/confirm/
API Endpoints Modified:
• POST /api/auth/register/ — sends verification email
• POST /api/auth/login/ — returns 403 email_not_verified for unverified customers
Frontend Pages Created:
• /verify-email/:uid/:token — EmailVerificationPage
• /verify-email/resend — EmailVerificationResendPage
Frontend Pages Modified:
• /register — success message prompts email verification
• /login — resend link when email not verified
Problems Encountered:
• None
Solutions Implemented:
• Reused PasswordResetService uid decoding + email link pattern; dedicated EmailVerificationTokenGenerator
Lessons Learned:
• Separate token generator salt prevents cross-feature token reuse
Next Development Task:
• Categories Django app + admin CRUD
Date: 2026-07-17
Working Hours:
Today's Objective: Password reset (verify + harden)
Modules Completed: Password reset session invalidation, confirm throttling, security logging
Files Created:
• None (feature already existed; Definition_of_Done.md populated)
Files Modified:
• backend/accounts/services.py
• backend/accounts/views.py
• backend/accounts/throttles.py
• backend/accounts/security_log.py
• backend/accounts/test_password_reset.py
• backend/accounts/tests.py
• backend/config/settings.py
• .cursor/Definition_of_Done.md
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• None (existing endpoints hardened)
API Endpoints Modified:
• POST /api/auth/password-reset/confirm/ — rate-limited (10/hour); blacklists refresh tokens
• POST /api/auth/change-password/ — blacklists outstanding refresh tokens after success
Frontend Pages Created:
• None (existing /forgot-password and /reset-password/:uid/:token unchanged)
Problems Encountered:
• None
Solutions Implemented:
• Reused PasswordResetService; added blacklist_all_refresh_tokens + log_password_reset
Lessons Learned:
• Password reset was already complete; hardening closed the session-reuse gap
Next Development Task:
• Email verification
Date: 2026-07-15
Working Hours:
Today's Objective: Admin user CRUD
Modules Completed: Admin users list/create/update/deactivate
Files Created:
• backend/accounts/admin_user_service.py
• backend/accounts/pagination.py
• backend/accounts/test_admin_users.py
• frontend/src/pages/Admin/AdminUsersPage.tsx
• frontend/src/pages/Admin/AdminUserDetailPage.tsx
Files Modified:
• backend/accounts/serializers.py
• backend/accounts/views.py
• backend/accounts/urls.py
• frontend/src/api/authApi.ts
• frontend/src/types/auth.ts
• frontend/src/App.tsx
• frontend/src/pages/Admin/AdminDashboardPage.tsx
• frontend/src/index.css
• PROJECT_STATUS.md
Database Changes:
• None
API Endpoints Added:
• GET/POST /api/auth/admin/users/
• GET/PATCH/DELETE /api/auth/admin/users/<uuid>/
Frontend Pages Created:
• /admin/users — AdminUsersPage
• /admin/users/:userId — AdminUserDetailPage
Problems Encountered:
• None
Solutions Implemented:
• AdminUserService with self/last-admin safeguards; reuse IsAdministrator
Lessons Learned:
• Soft-delete is safer than hard delete for marketplace accounts
Next Development Task:
• Categories Django app + admin CRUD
Deployment Checklist
• [ ] Backend Stable (formal production sign-off)
• [ ] Frontend Stable (formal production sign-off)
• [ ] Database Stable (formal production sign-off)
• [ ] Payments Tested (formal production sign-off; Stripe flows + unit/API tests exist)
• [x] Downloads Tested (unit/API + R2 signed path covered)
• [ ] Security Reviewed (runbook: docs/PRODUCTION_CHECKLIST.md §5; live review still open)
• [x] Docker Ready (Feature 13)
• [ ] Production Ready (checklist documented; host cutover open — docs/PRODUCTION_CHECKLIST.md)
Final Release Checklist
• [x] Marketplace Complete
• [x] Plugin Store Complete (R2 signed downloads when private object exists)
• [x] Custom Project Portal Complete (incl. Feature 15G quotation pay)
• [x] Customer Dashboard Complete
• [x] Admin Dashboard Complete (payments UI + analytics + QA queue)
• [x] Payment System Complete (Stripe cart + webhooks + Feature 15G)
• [x] Secure Downloads Complete (R2 presigned JSON + local FileResponse fallback)
• [x] Invoice PDF Complete (customer/admin download + receipt email)
• [x] Cloudflare R2 + batch ingest complete in marketplace repo (Features 14 / 14B / 16 Phases 3–10)
• [ ] Security Testing Complete
• [x] Performance Optimization Complete (code-level pass 2026-09-16; formal load testing still open)
• [ ] Production Deployment Complete (operator runbook: docs/PRODUCTION_CHECKLIST.md)
• [x] Feature 13 Docker / Gunicorn / Nginx stack
Project Completion
Current Completion Percentage: ~85%
Estimated Remaining Work: Execute production checklist on live/staging host, public polish (legal pages, fullscreen, search extras), catalog-bridge .exe polish (separate repo), optional activity-log UI / product tags
Expected Production Release Date: ____
Notes
UI prototype redesign is paused pending manager approval. Continue feature work on current UI.
Code scan 2026-09-16: outdated “R2/batch planned / ~70%” checklist blocks reconciled to match codebase.
Feature 10 In-app Notifications shipped 2026-08-03.
R2 + Batch Catalog Ingest shipped in marketplace repo (Features 14 / 14B / 16).
Feature 13 Docker stack shipped 2026-09-17 (Compose + Gunicorn + Nginx).
Browser E2E (Playwright) shipped 2026-09-17 (Compose overlay + CI job; Stripe test-mode simulate).
Celery async email shipped 2026-09-17 (Redis broker + Compose worker; Stripe fulfillment stays in-process).
Sentry monitoring wired 2026-09-17 (env-gated DSNs; scrubbing; webhook failure tags).
Production checklist runbook shipped 2026-09-17 (docs/PRODUCTION_CHECKLIST.md); Compose defaults remain console email / empty Stripe·R2·Sentry until host env is set.
