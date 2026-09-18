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

- [ ] ≥1 published product + ≥1 plugin with private package
- [ ] Search hit for a known name
- [ ] Replace demo SKUs before public launch if used only for smoke

---

## I2 — Staff, support, coupons, refunds

```bash
docker compose exec web python manage.py ensure_administrator --email ops@example.com --password '…'
docker compose exec web python manage.py check_ops_config --fail-on-warnings
```

Set on host:

| Variable | Purpose |
|----------|---------|
| `CONTACT_ADMIN_RECIPIENTS` | Contact form inbox(es) |
| `PROJECT_MESSAGE_ADMIN_RECIPIENTS` | Custom project message alerts |

**Refunds:** use Stripe Dashboard / API refunds. Webhook `charge.refunded` already marks payment/order refunded and blocks downloads (see `payments/webhook_service.py`). Do not invent a parallel refund path.

Optional: create a launch coupon in `/console` coupons admin.

- [ ] ≥1 Administrator can sign in at `/console/login`
- [ ] Contact form email arrives
- [ ] Project message / quotation emails arrive
- [ ] Refund process documented for support (Stripe → webhook → entitlement revoked)

---

## I3 — Batch Excel sign-off (if Feature 16 day-1)

1. Freeze columns per [`batch-ingest-contract.md`](batch-ingest-contract.md).
2. Dry-run import on staging with fixtures under `docs/fixtures/batch-ingest/`.
3. QA approve → publish → `reindex_search`.
4. Desktop bridge `.exe` polish stays **out of this repo**.

- [ ] Column contract signed (date/initials)
- [ ] Staging dry-run import OK
- [ ] Gate-failure fixtures rejected as expected
