# Stripe Live Checklist

Steps to switch from test payments to real ones. Do the sandbox checklist
(`STRIPE_SANDBOX_CHECKLIST.md`) and the launch test plan (`LAUNCH_TEST_PLAN.md`) in test mode first.

## Before you start

- The Stripe account is activated (business details, bank account, identity checks done) and
  Payments → Settings shows no open requirements.
- Public business details match the site: business name, support email, statement descriptor
  (what buyers see on their bank statement, for example `ASSETHIVE3D`).
- The Terms, Privacy and refund wording on the site are final.
- Radar rules are set (`STRIPE_RADAR.md`).

## Keys and webhook (Stripe dashboard in **live** mode)

1. Developers → API keys: copy the live secret key `sk_live_...` and publishable key `pk_live_...`.
   Use the standard secret key: the app refuses restricted keys (`rk_live_...`). Keep it only in
   Render; if it is ever exposed, roll it in Stripe and update Render.
2. Developers → Webhooks → Add endpoint: `https://assethive3d.com/api/v1/payments/webhook/`,
   with the same event types as in test mode (listed in `STRIPE_SANDBOX_CHECKLIST.md`).
   Live and test mode have separate endpoints and separate signing secrets.
3. Copy that endpoint's live signing secret `whsec_...`.

## Render (backend service → Environment)

Change these together, then use **Save, rebuild and deploy**:

| Name | Value |
|---|---|
| `STRIPE_PAYMENT_MODE` | `live` |
| `STRIPE_SECRET_KEY` | the live secret key |
| `STRIPE_PUBLISHABLE_KEY` | the live publishable key |
| `STRIPE_WEBHOOK_SECRET` | the live endpoint's `whsec_...` |
| `E2E_STRIPE_SIMULATE` | not set (delete it if present) |

Checkout refuses every payment while `STRIPE_PAYMENT_MODE` and the key disagree, so a half-done
change fails safely but stops sales.

## Check

With a shell (Render Shell on a paid plan):

```
python manage.py check_stripe_config --require-live-mode --fail-on-warnings --ping
```

It must end with `Stripe API ping OK (livemode=live)`. It never prints the keys.

Without a shell, do the real purchase below; it covers the same ground.

## One real purchase

1. Sign in with a real customer account (not an admin) and buy the cheapest product with a real card.
2. Within a minute: the order shows as paid in Dashboard → Orders, the receipt email arrives,
   and the file downloads.
3. Stripe → Developers → Webhooks → the live endpoint: the events show **200** responses.
4. Refund the payment in Stripe. Within a minute the order shows as refunded and the download is
   no longer offered.
5. Note the date below.

If the webhook shows errors, the order stays pending: check the signing secret first. Stripe
retries failed events for up to three days, so orders catch up once the secret is fixed.

## Going back to test mode

Set the four values back to their test versions and `STRIPE_PAYMENT_MODE=test`, then redeploy.
Paid orders from live mode keep their downloads.

## Record

| Date | Keys and webhook set | `--require-live-mode` passed | Real purchase + refund OK | Initials |
|------|----------------------|------------------------------|---------------------------|----------|
|      |                      |                              |                           |          |
