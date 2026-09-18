# Backend 10/10 Implementation Plan

**Goal:** Close every remaining backend architecture gap so the marketplace backend scores **10/10** (production-grade, observable, secure, maintainable) **without breaking** working marketplace, Stripe, custom projects, R2 catalog downloads, auth, or Celery mail.

**Status:** Phases A–G **done** (2026-09-18); Phases H–J not started  
**Created:** 2026-09-18  
**Related:** [PROJECT_STATUS.md](../PROJECT_STATUS.md) · [PLANNED_FEATURES.md](PLANNED_FEATURES.md) · [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) · Architect review (session)

---

## 0. Non‑negotiable rules (preserve the codebase)

1. **Do not rewrite working modules.** Prefer extract → reuse → thin wrappers. Views keep calling the same service method names where possible (facade pattern).
2. **Reuse first.** Before adding a new helper, search for:
   - `config.celery_utils.enqueue_after_commit`
   - `config.media.resolve_private_download` / `media_relative_path` / `open_stored_file`
   - `config.storages.get_private_storage` / `generate_private_presigned_url` / `call_with_storage_retries`
   - `orders.entitlements.user_owns_catalog_item` / `order_allows_download`
   - `accounts.security_log.log_admin_action` / `_redact_email`
   - `products.storage.ProductMediaStorageService` (already subclassed by `custom_projects.storage`)
   - `payments.services.WebhookService.handle_event` (extend with new `elif`, do not fork)
   - `_safe_email_text` / `_frontend_base_url` patterns in `orders/notifications.py` and `custom_projects/notifications.py`
3. **Fail-soft mail stays fail-soft.** Workflow APIs must still succeed if SMTP/Celery fails (existing policy).
4. **No new in-app notifications app.** Alerts remain **automated email only**.
5. **One phase at a time.** Each phase ends with green targeted tests + no regression on existing suites listed in that phase.
6. **Migrations are additive.** Prefer expand → migrate → contract. Never destructive reverse in prod.
7. **Minimal surface area.** Prefer extending an existing function over a parallel code path.

### Reuse map (build on these — do not duplicate)

| Capability | Canonical location | Used by |
|------------|-------------------|---------|
| Enqueue after DB commit | `backend/config/celery_utils.py` → `enqueue_after_commit` | custom_projects, orders, accounts mail |
| Private download (signed JSON or FileResponse) | `backend/config/media.py` → `resolve_private_download` | downloads app; **must** be used for project files too |
| Private storage + retries | `backend/config/storages.py` | products, plugins, media migration |
| Catalog entitlement | `backend/orders/entitlements.py` | downloads, reviews |
| Admin action log + ActivityLog | `backend/accounts/security_log.py` → `log_admin_action` | products/plugins/orders/coupons/accounts views |
| Project private prefixes | `backend/custom_projects/storage.py` | already extends `ProductMediaStorageService` |
| Stripe webhook idempotency | `WebhookService.handle_event` + `StripeWebhookEvent` | payments |
| Safe email text / deep links | duplicated in notification modules → **extract once** in Phase A |
| Sentry webhook tagging | `backend/config/sentry.py` → `capture_webhook_failure` | extend for mail exhaustion |

---

## Success criteria (backend = 10/10)

When this plan is complete:

- [x] Every workflow alert (quotation/offer, message, delivery, receipt, auth) goes through **one shared mail kernel** + optional **OutboundEmailLog** *(Phase A)*
- [x] Admin can **resend quotation email** without changing quotation data *(Phase A)*
- [x] Stripe **refunds** revoke download entitlement (and quotation-paid projects follow a defined policy) *(Phase B)*
- [x] Admin actions persist to **ActivityLog** (logger still used) *(Phase C)*
- [x] Custom-project private files use the **same** `resolve_private_download` path as catalog *(Phase D)*
- [x] Fat services are **split behind facades** (imports stable) *(Phase E)*
- [x] Password change invalidates access tokens (chosen mechanism) *(Phase F)*
- [x] Prod search policy + legacy `/api/` removal are decided and implemented *(Phase G)*
- [x] Backup/ops gates documented and runnable *(Phase J script + checklist; live drill = operator)*
- [x] All new behavior covered by Django tests; existing payment/custom-project/download suites still green

---

## Recommended build order (phases)

```text
Phase A  — Shared mail kernel + OutboundEmailLog + quotation resend     [Critical]
Phase B  — Stripe refund webhooks + quotation refund policy             [Critical]
Phase C  — ActivityLog (durable audit via existing log_admin_action)    [High]
Phase D  — Custom-project R2 parity (reuse resolve_private_download)  [High]
Phase E  — Service splits (facades; zero API change)                    [High]
Phase F  — Access-token revocation on password change                   [High]
Phase G  — Meili prod policy + legacy API removal                       [Medium]
Phase H  — Idempotency keys + Celery queue split + throttle gaps        ✅ (2026-09-18)
Phase I  — LegalAcceptance model + OpenAPI (optional excellence)        ✅ (2026-09-18)
Phase J  — Ops: backup script, PRODUCTION_CHECKLIST proof, cleanup      ✅ (2026-09-18)
```

Do **not** skip A/B before polish. Frontend legal pages can land in parallel with Phase I backend model.

---

## Phase A — Shared mail kernel + email log + quotation resend ✅ (2026-09-18)

### A.1 Problem
Mail helpers are duplicated; failures are only log lines; no admin resend; no durable proof an offer email was queued/sent.

### A.2 Reuse / extract (minimal new code) — **done**

Shipped: `backend/config/mail.py` (`frontend_base_url`, `safe_email_text`, `render_text_email`, `send_text_mail`).

### A.3 OutboundEmailLog model — **done**

Shipped: `backend/mail_log/` (`OutboundEmailLog`, `MailLogService`, read-only Django admin, migration `0001_initial_outbound_email_log`).

### A.4 Wire existing deliver functions — **done**

Wired: `custom_projects/notifications.py`, `orders/notifications.py`, `accounts/services.py` (verify/reset/password-changed), `contact/services.py`.

### A.5 Admin resend quotation email — **done**

- `CustomProjectService.resend_quotation_email`
- `POST /api/v1/admin/custom-projects/<id>/quotation/resend-email/`

### A.6 Tests — **done**

`mail_log/test_mail_log.py` + workflow resend/log assertions; patch targets updated to `config.mail.send_mail`.

### A.7 Done when
Existing mail still works in console mode; new log rows appear in tests; resend does not mutate quotation amounts. ✅

---

## Phase B — Stripe refunds (reuse WebhookService) ✅ (2026-09-18)

### B.1 Problem
`Payment.Status.REFUNDED` and order `refunded` exist, but `WebhookService.handle_event` only handled checkout completed / expired / payment_failed.

### B.2 Exact edits — **done**

| File | Change |
|------|--------|
| `payments/services.py` → `WebhookService` | `charge.refunded` → `_handle_charge_refunded` (full refund only when `charge.refunded` is true) |
| `orders/services.py` | `OrderService.mark_refunded` — transitions paid→refunded; calls quotation revert |
| `custom_projects/services.py` | `revert_quotation_after_refund` — unpaid; `in_progress`→`approved`; keep deliveries/quote |

### B.3 Policy locked

- Full refund → `Payment` + `Order` refunded → downloads denied via existing paid+paid gates.
- Partial refunds ignored (`refunded: false`).
- Quotation order refunded → project `payment_status=unpaid`; if `in_progress`, revert to `approved`; do not delete deliveries or change quotation status.

### B.4 Done when
Existing checkout tests still pass; new refund tests green; no change to completed-checkout happy path. ✅

---

## Phase C — Durable ActivityLog (extend log_admin_action) ✅ (2026-09-18)

### C.1 Problem
`log_admin_action` only logged. Need queryable audit without touching every call site twice.

### C.2 Exact approach — **done**

| File | Change |
|------|--------|
| `accounts/models.py` | `ActivityLog` (actor FK SET_NULL, action, target_id, metadata JSON, created_at) |
| `accounts/security_log.py` | `log_admin_action` also persists; fail-soft try/except |
| `GET /api/v1/admin/activity-logs/` | IsAdministrator, paginated; filters `action`, `actor_id`, `target_id` |
| Tests | `accounts/test_activity_log.py` — persist, fail-soft, product archive, list ACL/filter |

### C.3 Done when
One function change backs all existing admin audit call sites. ✅

---

## Phase D — Custom-project private download parity ✅ (2026-09-18)

### D.1 Problem
Catalog uses `resolve_private_download`; project refs/messages/deliveries must share that path.

### D.2 Exact approach — **done**

| File | Change |
|------|--------|
| `custom_projects/views.py` | All download views use `_private_download_response` → `resolve_private_download` (signed JSON or FileResponse) |
| `custom_projects/storage.py` | Prefixes `custom_projects/files|messages|deliveries` remain outside `PUBLIC_MEDIA_PREFIXES` |
| `config/media_migration.py` | `LocalMediaMigrationService` copies ProjectFile / ProjectMessageAttachment / ProjectDelivery private keys |
| `migrate_local_media_to_r2` | Help text covers custom-project private objects |
| Tests | Delivery/file/attachment signed JSON + R2 miss → stream; migration copies CP prefixes |

### D.3 Done when
No second presign implementation; one code path for all private objects. ✅

---

## Phase E — Service splits (facade — zero API break) ✅ (2026-09-18)

### E.1 Goal
Maintainability without breaking imports.

### E.2 Exact approach — **done**

| Area | Modules |
|------|---------|
| Custom projects | `service_common.py` + `project_service` / `quotation_service` / `message_service` / `delivery_service`; facade `CustomProjectService` in `services.py` |
| Payments | `payment_common.py` + `admin_payment_service` / `checkout_service` / `webhook_service`; facade re-exports in `services.py` |
| Views / URLs | Unchanged |
| Stripe test patches | Retargeted to `payments.checkout_service.stripe` |

### E.3 Tests
`custom_projects` + `payments` — 152 OK.

### E.4 Done when
Line count per file drops; public import paths stable. ✅

---

## Phase F — Access token revocation on password change ✅ (2026-09-18)

### F.1 Problem
`change_password` already blacklisted refresh tokens; access JWT remained valid until expiry.

### F.2 Exact approach — **done**

| File | Change |
|------|--------|
| `accounts/models.py` | `User.token_version` PositiveIntegerField default 0 |
| `accounts/migrations/0005_user_token_version.py` | Additive migration |
| `accounts/services.py` | Bump version on change_password + password reset confirm; `VersionedRefreshToken` via `build_tokens` |
| `accounts/tokens.py` | Embed `tv` claim on refresh/access |
| `accounts/authentication.py` | `VersionedJWTAuthentication` rejects mismatched `tv` |
| `config/settings.py` | DEFAULT_AUTHENTICATION_CLASSES → VersionedJWTAuthentication |
| Refresh cookie view | Reject refresh when `tv` ≠ current `token_version` |
| Tests | Stale access rejected after change + reset; fresh login works |

### F.3 Done when
Documented in PROJECT_STATUS Important Decisions; tests green. ✅

---

## Phase G — Meilisearch prod policy + legacy API removal ✅ (2026-09-18)

### G.1 Meili — **done**

| Change | Detail |
|--------|--------|
| `MEILI_REQUIRED` | Defaults to `not DEBUG`; overridable via env |
| `healthz` | Required + missing/down → **503** |
| Public product/plugin search | Required + down → **503** `code=search_unavailable` (no silent icontains) |
| DEBUG / not required | Postgres icontains fallback retained |

### G.2 Legacy `/api/` — **done**

| Change | Detail |
|--------|--------|
| `LegacyApiPathAliasMiddleware` | Removed |
| `JWT_REFRESH_COOKIE_PATH` | Default `/api/v1/auth/` |
| `clear_refresh_cookie` | Dual-clear `/api/`, `/api/auth/`, `/api/v1/auth/` for one release |

### G.3 Done when
Prod cannot report healthy with search broken if Meili required; cookie path not overly broad. ✅

---

## Phase H — Idempotency + queues + throttle gaps ✅ (2026-09-18)

### H.1 Idempotency (reuse Redis cache) — **done**

| File | Change |
|------|--------|
| `backend/config/idempotency.py` | `build_cache_key`, `get_or_set`, `idempotency_key_from_request` (24h TTL; caches 2xx only) |
| `CreateCheckoutSessionView` | `Idempotency-Key` → `idempotency:checkout:{user_id}:{key}` |
| `CustomerCustomProjectQuotationPayView` | `Idempotency-Key` → `idempotency:quotation_pay:{project_id}:{user_id}:{key}` |
| Tests | Double POST same key → one Stripe session (cart + quotation) |

### H.2 Celery queues — **done**

| File | Change |
|------|--------|
| Task definitions (`accounts`, `custom_projects`, `orders`, `contact`) | `queue="email"` on mail tasks |
| `docker-compose.yml` worker | `-Q celery,email` (single worker) |
| `settings.py` | `CELERY_TASK_ROUTES` for mail task names → `email` |

### H.3 Throttle gaps — **verified (no new scopes)**

| Action | Status |
|--------|--------|
| Quotation resend | `AdminCustomProjectWriteRateThrottle` already on view |
| Catalog import | `AdminProductWriteRateThrottle` on `AdminCatalogImportView` |
| Message create | `CustomProjectWriteRateThrottle` on POST via `get_throttles` |

---

## Phase I — LegalAcceptance + OpenAPI (excellence) ✅ (2026-09-18)

### I.1 LegalAcceptance (backend half) — **done**

| File | Change |
|------|--------|
| `accounts.LegalAcceptance` + migration `0006` | user FK, `document_key`, `version`, `accepted_at` (unique per trio) |
| `LEGAL_DOCUMENT_VERSIONS` / `LEGAL_TERMS_VERSION` / `LEGAL_PRIVACY_VERSION` | settings defaults `terms`/`privacy` = `2026-09-18` |
| Register | requires `accepted_legal` matching current versions; rows recorded |
| Checkout + quotation pay | require current acceptances; optional body `accepted_legal` records then proceeds |
| `GET /api/v1/auth/legal-documents/` | public current versions |
| `POST /api/v1/auth/legal-acceptances/` | authenticated re-accept (Google / legacy) |

Frontend register sends `accepted_legal` from `frontend/src/lib/legalDocuments.ts`. Full legal pages remain Feature 12.

### I.2 OpenAPI — **done**

| File | Change |
|------|--------|
| `drf-spectacular==0.28.0` | requirements |
| `/api/v1/schema/` + `/api/v1/schema/swagger-ui/` | schema + Swagger UI |
| CI | `python manage.py spectacular --file …` before tests (APIView warnings expected; no `--validate`) |

---

## Phase J — Ops, backup, cleanup, docs ✅ (2026-09-18)

### J.1 Backup — **done (engineering)**

| Deliverable | Detail |
|-------------|--------|
| `backend/scripts/backup_postgres.sh` | `pg_dump -Fc` via Compose or direct `DB_*`; optional `BACKUP_RETENTION_DAYS`; prints restore drill hints |
| `backend/scripts/restore_postgres_drill.sh` | Disposable Docker volume restore (Phase A5) — never mounts Compose `postgres_data` |
| `backend/scripts/upload_backup_to_r2.py` | Optional upload to `R2_PRIVATE_BUCKET` key `backups/postgres/…` (same R2_* env / boto3) |
| `docs/PRODUCTION_CHECKLIST.md` §2.6 / `docs/BACKUP_RESTORE_DRILL.md` | Cron + retention + operator restore-drill checkboxes |

Live restore drill on staging/prod remains an **operator** checkbox (cannot be completed from the repo alone).

### J.2 Cleanup — **done**

| Item | Status |
|------|--------|
| `backend/notifications/` remnant | Absent; not in `INSTALLED_APPS` |
| NotificationBell / `/dashboard/notifications` | Absent in frontend |
| PROJECT_STATUS / PLANNED_FEATURES / DatabaseDesign | Feature 10 marked removed / email-only; points at this plan |

### J.3 Production proof — **runbook ready; host execution = operator**

Engineering deliverable: checklist + backup script are runnable. Signing “Production Ready” still requires executing §1–§2 on staging/prod (SMTP, worker, webhook, Meili, R2, Sentry, backup restore).

---

## Phase-by-phase test matrix (do not skip)

| Phase | Must stay green | New coverage |
|-------|-----------------|--------------|
| A | `custom_projects`, `orders` receipt, `accounts` email tests, `config/test_celery` | mail_log + resend |
| B | `payments`, `test_quotation_payments`, `downloads` | refund events |
| C | admin write tests (products/users) | ActivityLog assert |
| D | `test_custom_projects` download cases, `products/test_storage` | project signed JSON |
| E | full custom_projects + payments | none (refactor) |
| F | auth password change / reset | old access rejected |
| G | `test_health`, `test_legacy_api` | Meili required behavior |
| H | checkout tests | idempotency double-submit |
| I | register/checkout | legal acceptance |
| J | N/A | ops drill |

Commands (from `backend/`):

```bash
python manage.py test mail_log custom_projects.payments payments downloads accounts config --verbosity=1
```

(Adjust module paths to match Django app labels.)

---

## Explicit out of scope (do not do in this plan)

- Rebuilding in-app notifications / Feature 10 bell
- PayPal / Razorpay
- Merging Product + Plugin tables
- Microservices split
- Frontend UI redesign
- catalog-bridge `.exe` polish (separate repo)

---

## Risk register & mitigations

| Risk | Mitigation |
|------|------------|
| Refactor breaks imports | Facade in `services.py`; run full app tests before merge |
| Mail logging breaks send | try/except around log writes; never block `send_mail` |
| Refund false positive | Only mark refunded on Stripe event; require payment_intent match; tests for unknown charge no-op |
| R2 project download change | Keep FileResponse fallback via existing `resolve_private_download` |
| Token version locks everyone out | Migrate default `token_version=0`; mint claim only on new tokens; old tokens without claim: treat as 0 **or** force re-login once (document) |

---

## Effort estimate (rough)

| Phase | Effort | Depends on |
|-------|--------|------------|
| A | 1–2 days | — |
| B | 1–2 days | — |
| C | 0.5–1 day | — |
| D | 1 day | — |
| E | 1–2 days | A resend already in services |
| F | 0.5–1 day | — |
| G | 0.5 day | Client cutover for alias |
| H | 0.5–1 day | Redis |
| I | 0.5–1 day | Legal copy |
| J | Ops schedule | Host access |

**Total engineering:** ~8–12 focused days + ops checklist execution.

---

## Definition of Done checklist (sign-off)

- [x] Phases A–I engineering merged with tests (2026-09-18)
- [x] Phase H idempotency + email queue done
- [x] Phase J engineering: backup script + checklist link + Feature 10 cleanup docs (2026-09-18)
- [ ] Phase J **live** staging/prod checklist execution (operator — SMTP, worker, webhook, Meili, R2, Sentry, restore drill)
- [x] PROJECT_STATUS: backend architecture **10/10 engineering target met**; Important Decisions include refund policy, token_version, Meili required, email-only
- [x] No new parallel download/email/presign implementations — only shared helpers
- [x] Marketplace cart checkout, quotation pay, catalog download, custom project suites covered by API/E2E tests in repo

---

## Quick start for the implementing agent

1. Read this document fully.
2. Start **Phase A only**: add `config/mail.py` helpers by **moving** duplicated functions; add `mail_log` app; wire logs; add resend endpoint; tests.
3. Do not start Phase E refactor until A+B are green.
4. After each phase: update `PROJECT_STATUS.md` daily log + checkboxes in this file.

**Preserve. Reuse. Extend. Test. Then next phase.**
