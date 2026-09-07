# Planned Features — 3D Asset Marketplace

**Purpose:** Single checklist of work remaining to finish **Phase 1** of the platform.  
**Sources:** [PROJECT_STATUS.md](../PROJECT_STATUS.md), [PROJECT_MASTER_PLAN.md](../PROJECT_MASTER_PLAN.md), [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md), [docs/batch-ingest-contract.md](batch-ingest-contract.md)  
**Last scanned:** 2026-08-27  
**Overall completion (per PROJECT_STATUS):** ~70%

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

## Recommended build order

```text
1. Feature 13 — Docker (local/prod runtime)
2. Feature 12 — Public site polish (remaining)
3. Feature 14 — Cloudflare R2 (public + private buckets) — **Done**
4. Feature 14B — Signed R2 download URLs — **Done**
5. Feature 16 Phase 6 — Catalog Import API (marketplace repo) — **Done**
6. Feature 16 Phase 8 — QA approve / reject → publish workflow (backend) — **Done**; Phase 7 Admin QA UI still pending
7. catalog-bridge — Desktop .exe (separate repo; depends on 14 + Phase 6)
8. Feature 16 Phases 9–10 — E2E + hardening
9. Sprint 11 — Testing, security, performance, deployment
```

---

## 1. Infrastructure & deployment

| Feature | Status | Description |
|---------|--------|-------------|
| **Feature 13 — Docker** | Planned | Production-ready `docker-compose.yml`, Gunicorn, Nginx, env templates |
| **Configure Docker** (Sprint 1) | Not done | Local + prod container workflow |
| **Production deployment** (Sprint 11) | Planned | Server setup, Cloudflare CDN, monitoring |
| **Backend / frontend / DB stability gates** | Open | Final release checklist items still unchecked |

---

## 2. Cloud storage (Feature 14 + 14B)

Detailed plan: [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md)

### Feature 14 — Cloudflare R2 foundation

| Item | Status |
|------|--------|
| Phase 0 — R2 buckets, API token, public URL, CORS, `.env` | **Done** (app reads env; local filesystem if unset) |
| `django-storages` + `boto3` dual backends (public + private) | **Done** |
| Product/plugin uploads → correct bucket | **Done** |
| Public preview URLs via `R2_PUBLIC_BASE_URL` | **Done** |
| Local filesystem fallback when R2 unset (dev/CI) | **Done** |
| Migrate off local `MEDIA_ROOT` for catalog media | Partial — new uploads use R2 when configured; existing local files still served |

**Decisions (locked):**

- **Public bucket:** thumbnails, preview GLB, gallery images
- **Private bucket:** paid `package.zip` (never public)
- Admin-upload keys: `products/images/`, `products/previews/`, `products/files/`
- Batch-upload keys: `models/{Model_ID}/` (Feature 16)

### Feature 14B — Signed download URLs

| Item | Status |
|------|--------|
| Entitlement check → presigned GET on private bucket | **Done** |
| JSON response `{ download_url, expires_in, file_name }` | **Done** |
| Frontend download flow update (`downloadsApi.ts`) | **Done** |
| Replace local `FileResponse` for catalog packages in prod | **Done** when R2 object exists; local stream remains fallback |

**Technical debt this resolves:** catalog product/plugin packages download via presigned private GET instead of Django streaming. Custom-project / delivery files still use FileResponse.

---

## 3. Batch catalog ingest (Feature 16)

Contract: [batch-ingest-contract.md](batch-ingest-contract.md)

| Phase | Work | Status | Repo |
|-------|------|--------|------|
| 3 | Product SKU / `Model_ID` identity | **Done** | marketplace |
| 4 | Freeze Batch Output Report + intake contracts | **Done** | marketplace |
| 5 | Bridge uploader (Excel + folders → R2 split) | Planned | **separate `catalog-bridge` project** |
| 6 | Catalog Import API (`pending_review` upsert by SKU) | **Done** | marketplace |
| 7 | Admin import review UI (batch filter, QA queue) | Planned | marketplace |
| 8 | QA approve / reject → publish workflow | **Done** (backend API; Phase 7 UI still pending) | marketplace |
| 9 | E2E: import → admin QA → publish → Stripe → signed download | Planned | both |
| 10 | Hardening (retries, large packages, media migration) | Planned | both |

**Hard rules (non-negotiable):**

1. `Model_ID` = `Product.sku` — only join key
2. Bridge/import **never** sets `status=published`
3. Paid packages **never** in public R2
4. Admin QA on website is the final publish gate

**Blockers / inputs:**

- Live Phase 1 intake Excel sign-off for proposed columns (Thumbnail Path, Gallery, Tags)
- R2 credentials (Feature 14) before bridge E2E

---

## 4. Commerce & documents

| Feature | Status | Description |
|---------|--------|-------------|
| **Invoice generation** (Sprint 6) | Deferred | `invoice_number` exists; formal PDF invoices — partial receipt email shipped |
| **PayPal / Razorpay** (Feature 15 remainder) | Out of scope unless revived | Stripe is primary gateway |

---

## 5. UI / UX polish (Feature 12)

| Item | Status | Description |
|------|--------|-------------|
| Public site & navigation polish | Partial | About, Contact, Custom Projects landing, footer, global search — shipped |
| UI redesign from manager prototype | **Blocked** | Waiting on manager approval |
| 3D viewer fullscreen mode (Sprint 4) | Deferred polish | Optional |
| Admin `import_batch_id` filter in products UI | Planned (Phase 7) | Backend filter exists |

---

## 6. Search (future / master plan)

| Item | Status | Notes |
|------|--------|-------|
| **Meilisearch** | Not started | Listed in master plan; no `backend/search` app yet |
| Current search | **Done** | PostgreSQL `icontains` on `/api/products/?search=` + navbar deep links |

Meilisearch is **not** on the critical path for Phase 1 release but is planned for scale.

---

## 7. Testing & quality (Sprint 11)

| Item | Status |
|------|--------|
| API testing (formal suite / coverage goals) | Planned |
| UI testing (E2E beyond unit tests) | Planned |
| Security testing | Planned |
| Performance optimization | Planned |
| Production testing | Planned |
| Security review (final checklist) | Open |

**Existing today:** extensive Vitest/pytest unit tests per module; not a full formal QA sprint.

---

## 8. Technical debt to clear before production

From [PROJECT_STATUS.md](../PROJECT_STATUS.md) — addressed by planned features above:

| Debt | Resolved by |
|------|-------------|
| Local `MEDIA_ROOT` for catalog media | Feature 14 (new uploads when R2 env set; legacy files remain local) |
| `FileResponse` downloads from disk | Feature 14B (R2 objects); local leftover files still stream |
| No batch import path (admin one-by-one only) | Feature 16 Phase 6 **Done**; catalog-bridge (Phase 5) still needed |
| Docker Compose not production-ready | Feature 13 |
| Admin audit logging | Not yet scoped — consider pre-launch |
| Custom-project / message / delivery files on local disk | Feature 14B pattern (later phase) |

---

## 9. Final release checklist (unchecked)

From PROJECT_STATUS final gates:

- [ ] Backend stable
- [ ] Frontend stable
- [ ] Database stable
- [ ] Payments tested (formal sign-off)
- [ ] Security reviewed
- [ ] Docker ready
- [ ] Production ready
- [ ] Security testing complete
- [ ] Performance optimization complete
- [ ] Production deployment complete
- [ ] **Cloudflare R2 + batch ingest complete** (Features 14, 14B, 16)

**Already complete (major modules):**

- [x] Marketplace (browse, details, 3D viewer, cart, checkout)
- [x] Plugin store
- [x] Custom project portal (incl. quotation Stripe pay — Feature 15G)
- [x] Customer dashboard
- [x] Admin dashboard (orders, payments, analytics, moderation)
- [x] Stripe payments + webhooks
- [x] Secure downloads (local stream fallback; R2 signed URLs = Feature 14B)
- [x] Reviews, wishlist, notifications, coupons

---

## 10. Future phases (out of Phase 1 scope)

From [PROJECT_MASTER_PLAN.md](../PROJECT_MASTER_PLAN.md) — **not required to finish current release:**

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
| Excel + models folder picker, batch QA UI, R2 upload, call Import API | `catalog-bridge` (new) |

Architecture plan: Cursor plan `catalog_bridge_exe` (copy to `docs/catalog-bridge-architecture.md` when ready).

---

## Quick summary — what’s left for Phase 1

| Priority | Feature | Effort (rough) |
|----------|---------|----------------|
| High | Feature 16 Phase 7 — Admin QA queue UI | Medium |
| High | catalog-bridge desktop app | Large (separate repo) |
| High | Feature 13 — Docker + deployment | Medium |
| Medium | Feature 16 Phases 9–10 — E2E + hardening | Medium |
| Medium | Sprint 11 — Security & performance QA | Medium |
| Low | Feature 12 — Remaining UI polish | Small–medium |
| Low | Invoice PDF polish | Small |
| Low | 3D viewer fullscreen | Small |
| Later | Meilisearch | Large |
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
