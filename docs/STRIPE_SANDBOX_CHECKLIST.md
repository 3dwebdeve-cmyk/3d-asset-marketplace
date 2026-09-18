# Stripe sandbox checklist (Phase B) — NOT live launch

**Scope:** Test-mode Stripe only (`sk_test_` / `pk_test_`). Do **not** put `sk_live_` keys in local or staging until Phase K production cutover.

**Related:** `docs/PRODUCTION_CHECKLIST.md` §2.5 (live webhook), `backend/payments/webhook_service.py` (`STRIPE_WEBHOOK_EVENT_TYPES`).

---

## 0. Same-origin API (local Vite) — required

SPA on `http://localhost:5173` must call the API via the Vite proxy:

```env
# frontend/.env
VITE_API_BASE_URL=
```

Do **not** set `VITE_API_BASE_URL=http://127.0.0.1:8000`. That makes refresh cookies cross-site; after Stripe returns (full page reload) the session refresh XHR omits the Lax cookie → sudden logout → “Missing order” if `order_id` is dropped on re-login.

Restart `npm run dev` after changing this.

---

## 1. Keys (sandbox)

In root `.env` or `backend/.env` (never commit real secrets):

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
E2E_STRIPE_SIMULATE=False
```

- Use Dashboard → Developers → API keys → **Test mode**.
- Never set `E2E_STRIPE_SIMULATE=True` with live keys (settings refuse `sk_live_` + simulate).

Local Compose without a public URL can keep `E2E_STRIPE_SIMULATE=True` for CI/browser E2E only.

### Verify config (no secrets printed)

From `backend/` (venv active):

```bash
python manage.py check_stripe_config --require-test-mode --fail-on-warnings
# Optional network smoke (uses secret key; does not print it):
python manage.py check_stripe_config --require-test-mode --ping
```

Expect `STRIPE_SECRET_KEY_mode=test`, valid `whsec_` webhook secret, and the four event types listed below.

### Verify config (no secrets printed)

From `backend/`:

```bash
python manage.py check_stripe_config --require-test-mode --fail-on-warnings
# Optional network check of the secret key:
python manage.py check_stripe_config --require-test-mode --ping
```

Expect `STRIPE_SECRET_KEY_mode=test`, valid `whsec_` webhook secret, and the four event types listed below. The command never prints key material.

---

## 2. Webhook endpoint

Canonical URL:

`POST https://<host>/api/v1/payments/webhook/`

Subscribe **exactly** these event types (handled in code):

- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.payment_failed`
- `charge.refunded`

### Local (Stripe CLI)

```bash
stripe listen --forward-to localhost:8000/api/v1/payments/webhook/
```

Copy the CLI `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart `runserver` / Compose `web`.

### Staging host

Stripe Dashboard → Developers → Webhooks → Add endpoint (Test mode) → same path → copy signing secret.

---

## 3. Sandbox smoke (happy path)

1. Register (accept Terms/Privacy) → verify email if required → add product to cart.
2. Checkout → complete Stripe **test** card (`4242…`).
3. Confirm: order paid, payment succeeded, download entitled, receipt email (or console mail in local).
4. Stripe Dashboard → send the same `checkout.session.completed` again → still one fulfillment (idempotent).

Optional: issue a full test refund → order/payment marked refunded; download entitlement blocked.

---

## 4. Legal pages (Phase B2)

Public URLs (SEO indexed):

- `/terms` — Terms of Service (version in page + `LEGAL_DOCUMENT_VERSIONS`)
- `/privacy` — Privacy Policy

Checkout and quotation pay send `accepted_legal` matching frontend `LEGAL_DOCUMENT_VERSIONS` / backend `LEGAL_TERMS_VERSION` + `LEGAL_PRIVACY_VERSION`.

---

## 5. Done when

- [ ] `check_stripe_config --require-test-mode --fail-on-warnings` passes  
- [ ] Test keys configured locally or on staging  
- [ ] Webhook secret set; signature failures return 400  
- [ ] One full test checkout fulfills order + download  
- [ ] Duplicate webhook is a no-op  
- [ ] `/terms` and `/privacy` open; register/cart link to them  

**Production live keys:** leave for Phase K / `PRODUCTION_CHECKLIST.md` — not this sandbox phase.
