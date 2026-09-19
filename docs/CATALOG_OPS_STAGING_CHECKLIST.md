# Catalog & ops staging checklist (Phases I1–I3)

**Related:** `seed_demo_catalog`, `ensure_administrator`, `check_ops_config`, `audit_published_packages`, `reindex_search`, [`batch-ingest-contract.md`](batch-ingest-contract.md).

---

## I1 — Sellable catalog

Prefer real SKUs via `/console` or Feature 16 import → QA approve. For empty staging only:

```bash
docker compose exec web python manage.py seed_demo_catalog
docker compose exec web python manage.py audit_published_packages --fail-on-missing
docker compose exec web python manage.py reindex_search
```

Confirm public browse shows priced products/plugins with previews; paid download smoke after Stripe test checkout.

- [x] ≥1 published product + ≥1 plugin with private package (local 2026-09-19: `seed_demo_catalog` → 3 products + 2 plugins; unpublished incomplete `tree` / `oak-chair`)
- [x] Search hit for a known name (Meili reindex + `?search=Demo Oak Chair` / `UV Toolkit`)
- [x] Paid download smoke after entitlement (local FileResponse 200 for `demo-oak-chair`; Stripe path covered by `test_catalog_commerce_e2e`)
- [ ] Replace demo SKUs before public launch if used only for smoke

---

## I2 — Staff, support, coupons, refunds

```bash
docker compose exec web python manage.py ensure_administrator --email ops@example.com --password '…'
docker compose exec web python manage.py check_ops_config --fail-on-warnings
```

Set on host (web **and** worker):

| Variable | Purpose |
|----------|---------|
| `CONTACT_ADMIN_RECIPIENTS` | Contact form inbox(es); comma-separated |
| `PROJECT_MESSAGE_ADMIN_RECIPIENTS` | Custom project message / quotation-accepted staff alerts |

Fallback when env is empty (DEBUG only): active Administrator account emails. Launch hosts (`DEBUG=False`) must set both vars or `check_ops_config --fail-on-warnings` fails.

### Support refund path (no new code)

Operators refund in **Stripe Dashboard** (or Stripe API). Do **not** add a parallel marketplace refund button.

1. Support issues a **full** refund on the Stripe charge / PaymentIntent.
2. Stripe sends webhook `charge.refunded` to `/api/v1/payments/webhook/`.
3. Existing handler (`payments/webhook_service.py` → `_handle_charge_refunded`):
   - Marks `Payment` status `refunded`
   - Calls `OrderService.mark_refunded` → order + payment_status `refunded`
   - Downloads are denied automatically (entitlement requires paid order)
   - Custom-project quotation payments revert via `CustomProjectService.revert_quotation_after_refund`
4. Partial refunds (`charge.refunded` false) are ignored — use full refunds for Phase 1 support.

Confirm webhook is configured for `charge.refunded` (see `docs/STRIPE_SANDBOX_CHECKLIST.md`).

Optional: create a launch coupon in `/console` coupons admin (or `CouponService.create_coupon`).

- [x] ≥1 Administrator can sign in at `/console/login` (local 2026-09-19: `admin@marketplace.local`; D1 login smoke + I2 `ensure_administrator` / `check_ops_config`)
- [x] Contact form email arrives (local 2026-09-19: `ContactService.deliver` + `POST /api/v1/contact/` → console mail to `CONTACT_ADMIN_RECIPIENTS`)
- [x] Project message / quotation emails arrive (local 2026-09-19: `deliver_quotation_accepted` → `admin@marketplace.local` via `PROJECT_MESSAGE_ADMIN_RECIPIENTS`)
- [x] Refund process documented for support (Stripe → `charge.refunded` webhook → order refunded + downloads revoked; no new code)
- [x] Optional launch coupon `LAUNCH10` (10% off, max 100 uses / 1 per user, expires 2026-12-18)
- [ ] Staging/prod: set real staff inboxes on host; re-run `check_ops_config --fail-on-warnings` with `DEBUG=False`

---

## I3 — Batch Excel sign-off (if Feature 16 day-1)

1. Freeze columns per [`batch-ingest-contract.md`](batch-ingest-contract.md) (date/initials).
2. Dry-run / apply import with fixtures under `docs/fixtures/batch-ingest/`.
3. QA approve → publish → `reindex_search`.
4. Desktop bridge `.exe` polish stays **out of this repo**.

### Automated runner (preferred)

From `backend/` (venv active):

```bash
python manage.py check_batch_ingest
# Import happy fixture → approve → published (+ reindex when MEILI_URL set):
python manage.py check_batch_ingest --apply
```

Compose:

```bash
docker compose exec web python manage.py check_batch_ingest --apply
```

| Check | Expectation |
|-------|-------------|
| Fixture CSV headers | Match locked report + intake columns in contract |
| `MDL-000142` (happy) | Gate **pass** → `--apply` creates `pending_review` then **published** |
| `MDL-000199` (mismatch) | Skip `folder_mismatch` |
| `MDL-000201` / `202` / `203` | Skip `exports_incomplete` / `invalid_price` / `missing_thumbnail` |

- [x] Column contract signed (2026-09-19 / Auto) — `Thumbnail Path`, `Gallery Image Paths`, `Tags`, sheet `Intake` locked in `batch-ingest-contract.md`
- [x] Local dry-run + apply OK (2026-09-19) — `manage.py check_batch_ingest` / `--apply`
- [x] Gate-failure + mismatch fixtures rejected as expected
- [ ] Staging/prod: re-run `check_batch_ingest --apply` on host when Feature 16 is day-1 (real R2 objects / Meili)
