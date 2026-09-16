# Planned Features — 3D Asset Marketplace

**Purpose:** Single checklist of work remaining to finish **Phase 1** of the platform.  
**Sources:** [PROJECT_STATUS.md](../PROJECT_STATUS.md), [PROJECT_MASTER_PLAN.md](../PROJECT_MASTER_PLAN.md), [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md), [docs/batch-ingest-contract.md](batch-ingest-contract.md)  
**Last scanned:** 2026-09-16 (codebase + routes + deps + tests)  
**Overall completion (per PROJECT_STATUS):** ~82%

---

## Definition of done (Phase 1)

From [PROJECT_MASTER_PLAN.md](../PROJECT_MASTER_PLAN.md), the project is successful when:

- International customers can browse, preview, and purchase 3D models and plugins
- Custom project requests, quotations, payment, and delivery work end-to-end
- Admins manage the full platform from the dashboard
- Payments are verified server-side; downloads are entitlement-gated
- **Large inventories can be batch-ingested to R2 and QA-published** (not one-by-one admin upload)
- Platform is stable at thousands of products and ready for production deployment

---

## Recommended build order (remaining)

```text
1. Feature 13 — Docker (app + DB + Gunicorn + Nginx; compose today is Meilisearch-only)
2. Feature 12 — Public site polish (legal pages, viewer fullscreen, footer newsletter)
3. Sprint 11 — Formal API/UI/security/performance testing + production deployment
4. catalog-bridge Windows .exe polish (separate repo)
5. Optional / later — Search extras, product tags, Celery, DB activity-log UI
```

---

## 1. Infrastructure & deployment

| Feature | Status | Evidence / notes |
|---------|--------|------------------|
| **Feature 13 — Docker** | **Not done** | Root `docker-compose.yml` = Meilisearch only; **no Dockerfile** for app |
| **Configure Docker** (Sprint 1) | **Not done** | Local + prod container workflow missing |
| **Production deployment** (Sprint 11) | **Not done** | Server, CDN, monitoring not signed off |
| **Backend / frontend / DB stability gates** | **Open** | Final release checklist still unchecked |

---

## 2. Cloud storage (Feature 14 + 14B) — Done in code

| Item | Status | Evidence |
|------|--------|----------|
| Dual R2 backends + local fallback | **Done** | `backend/config/storages.py`, `django-storages` + `boto3` in requirements |
| Entitlement → private presigned GET JSON | **Done** | `backend/downloads/services.py` |
| Media migration command | **Done** (ops) | `migrate_local_media_to_r2` — legacy local files may still exist until run |
| Custom-project / delivery files on R2 | **Later** | Still local / FileResponse pattern |

---

## 3. Batch catalog ingest (Feature 16) — Done in marketplace repo

| Phase | Work | Status | Evidence |
|-------|------|--------|----------|
| 3 | Product SKU / `Model_ID` | **Done** | `Product.sku`, `import_batch_id` |
| 4 | Frozen contracts + fixtures | **Done** | `docs/batch-ingest-contract.md`, fixtures |
| 5 | Bridge uploader | **Done** (local); **.exe polish separate** | catalog-bridge repo |
| 6 | Catalog Import API | **Done** | `backend/products/catalog_import.py` + tests |
| 7 | Admin QA queue UI | **Done** | `/admin/products?status=pending_review` |
| 8 | Approve / reject → publish | **Done** | Admin product detail QA actions |
| 9 | API E2E import → pay → download | **Done** | `test_catalog_commerce_e2e.py` |
| 10 | Hardening (retries, migration) | **Done** | storages retries + migrate command |

**Still open outside marketplace app code:** live intake Excel sign-off; desktop bridge `.exe` polish; browser E2E (not just API).

---

## 4. Commerce & documents

| Feature | Status | Evidence |
|---------|--------|----------|
| **Invoice PDF** | **Done** | `orders/invoice.py`, customer/admin `/invoice/` routes, receipt email attach, UI download buttons |
| **Stripe cart + quotation pay** | **Done** | `payments/`, Feature 15G tests |
| **PayPal / Razorpay** | Out of scope | Unless revived |

---

## 5. UI / UX polish (Feature 12) — remaining

| Item | Status | Notes |
|------|--------|-------|
| About / Contact / Custom Projects / footer nav | **Done** | Public routes exist |
| Plugin buy / cart / wishlist CTAs | **Done** | `PluginCtaGroup` uses Buy now + AddToCart (not “coming soon”) |
| UI redesign from manager prototype | **Blocked** | Waiting on manager approval |
| 3D viewer fullscreen | **Not done** | No `requestFullscreen` in viewer |
| Legal pages (Privacy, Terms, Licensing) | **Not done** | Footer links go to `/contact` |
| Newsletter subscribe | **Not done** | Footer form navigates to `/contact` only |
| Dedicated Search page / typeahead / tags | **Later** | Meilisearch live; no `ProductTag` model |
| Customer Settings page | **Not done** | Profile only; no `/settings` route |
| Orphan `HomePage` | Cleanup | Home route uses `ProductsBrowsePage` |

---

## 6. Search

| Item | Status | Notes |
|------|--------|-------|
| **Meilisearch** | **Done** | `backend/search`; Postgres fallback; `docker compose up meilisearch` |
| Navbar + browse `?search=` | **Done** | |
| Later extras | Planned | Dedicated Search page, typeahead, tags, require Meili when `DEBUG=False`, Celery indexing |

---

## 7. Testing & quality (Sprint 11)

| Item | Status |
|------|--------|
| Unit / API tests | **Extensive** (~35 backend `test_*.py`, ~85 frontend Vitest files) |
| Formal API testing sign-off | **Open** |
| Browser E2E (Playwright/Cypress suite) | **Not done** (no project E2E suite; API E2E only) |
| Security testing | **Open** |
| Performance optimization | **Open** |
| Production testing | **Open** |

---

## 8. Technical debt before production

| Debt | Status |
|------|--------|
| Docker Compose not production-ready | **Open** — Feature 13 |
| Legacy catalog media still on local disk | **Partial** — migrate command exists |
| Custom-project files on local disk | **Later** |
| Admin audit as DB Activity Logs UI | **Not done** — `log_admin_action` → logger only |
| Celery async jobs | **Not installed** (Redis used for cache/rate limits when set) |

---

## 9. Final release checklist

- [ ] Backend stable (production sign-off)
- [ ] Frontend stable (production sign-off)
- [ ] Database stable (production sign-off)
- [ ] Payments tested (formal sign-off)
- [ ] Security reviewed
- [ ] Docker ready
- [ ] Production ready
- [ ] Security testing complete
- [ ] Performance optimization complete
- [ ] Production deployment complete

**Already complete (major modules):**

- [x] Marketplace (browse, details, 3D viewer, cart, checkout)
- [x] Plugin store (incl. cart/buy CTAs)
- [x] Custom project portal (incl. quotation Stripe pay — Feature 15G)
- [x] Customer dashboard
- [x] Admin dashboard (orders, payments, analytics, moderation, QA queue)
- [x] Stripe payments + webhooks
- [x] Secure downloads (R2 signed URLs + local fallback)
- [x] Invoice PDF + receipt email
- [x] Reviews, wishlist, notifications, coupons
- [x] Cloudflare R2 + batch ingest (Features 14 / 14B / 16 in marketplace repo)
- [x] Meilisearch public catalog search

---

## 10. Future phases (out of Phase 1 scope)

### Phase 2

- AI chat assistant
- Browser-based 3D editing
- Cloud rendering
- AI image generation
- AI design suggestions

### Phase 3

- External seller marketplace
- Subscription plans
- Seller dashboard
- Mobile application
- Team collaboration
- Advanced analytics
- Third-party API

---

## 11. Separate project: catalog-bridge

The desktop Windows `.exe` for company batch upload is **not** in this repo.

| Responsibility | Repo |
|----------------|------|
| Import API, R2 config, admin QA, public website | `3d-asset-marketplace` |
| Excel + models folder picker, batch QA UI, R2 upload, call Import API | `catalog-bridge` (separate) |

---

## Quick summary — what’s left for Phase 1

| Priority | Feature | Effort (rough) |
|----------|---------|----------------|
| **High** | Feature 13 — Docker + Gunicorn + Nginx | Medium |
| **High** | Sprint 11 — Security, performance, deploy, formal QA | Medium–Large |
| Medium | catalog-bridge desktop .exe polish | Large (separate repo) |
| Medium | Feature 12 — Legal pages, newsletter, viewer fullscreen | Small–medium |
| Low | Search extras (typeahead, Search page, tags) | Medium |
| Low | Celery / DB activity-log UI / Settings page | Medium |
| Blocked | Manager UI redesign | Waiting approval |
| Later | Phase 2 / Phase 3 roadmap | Future |

---

## Related documents

| Document | Purpose |
|----------|---------|
| [PROJECT_STATUS.md](../PROJECT_STATUS.md) | Day-to-day progress, sprints, daily log |
| [PROJECT_MASTER_PLAN.md](../PROJECT_MASTER_PLAN.md) | Vision, modules, future phases |
| [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md) | R2 + batch ingest implementation detail |
| [batch-ingest-contract.md](batch-ingest-contract.md) | Frozen ingest schema and gate rules |
| [DATABASE_STRUCTURE.md](../DATABASE_STRUCTURE.md) | Schema reference |
