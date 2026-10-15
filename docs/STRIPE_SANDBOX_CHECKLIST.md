# Stripe Sandbox Checklist

Use Stripe **test mode** on local and staging. Live keys are a separate go-live decision.

## Keys and webhook

1. In the Stripe dashboard (test mode), copy the secret key `sk_test_...` and the
   publishable key `pk_test_...` into `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
2. Keep `STRIPE_PAYMENT_MODE=test`. The app refuses a key whose mode does not match.
3. Add a webhook endpoint pointing at `https://<api-host>/api/v1/payments/webhook/`
   and subscribe to the event types in `backend/payments/webhook_service.py`
   (`STRIPE_WEBHOOK_EVENT_TYPES`):
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `payment_intent.payment_failed`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.closed`.
4. Put the endpoint's signing secret `whsec_...` in `STRIPE_WEBHOOK_SECRET`.
5. Never enable `E2E_STRIPE_SIMULATE` outside local or CI. Settings refuse it with live keys.

## Local testing with the Stripe CLI

```
stripe listen --forward-to localhost:8000/api/v1/payments/webhook/
```

Use the `whsec_...` value the CLI prints as `STRIPE_WEBHOOK_SECRET` while it runs.

## Checks

```
docker compose exec web python manage.py check_stripe_config --require-test-mode --fail-on-warnings
docker compose exec web python manage.py check_stripe_config --require-test-mode --ping
docker compose exec web python manage.py check_stripe_config --require-test-mode --smoke-fulfill
```

- `--ping` calls Stripe to prove the key works.
- `--smoke-fulfill` creates a test Checkout Session, posts a signed webhook, and checks
  the order is fulfilled once and a replay is ignored. Add `--keep-smoke-data` to keep the rows.

## Behaviour to know

- A paid session that fails validation (amount, currency, customer or order mismatch)
  is **not** acknowledged: the webhook returns an error so Stripe retries, and Sentry
  reports it (tag `area: payments_webhook`). Fix the cause, or reconcile the order by hand.
- Paid and refunded order states come only from Stripe events. The admin API and the
  Django admin cannot set them.
- Reconcile one order against Stripe (test keys only):
  `docker compose exec web python manage.py reconcile_checkout <order_id>`, then add `--execute` to apply.
- Local consistency check (no Stripe calls): `docker compose exec web python manage.py check_payment_reconciliation`.
- Stripe comparison (read-only, runs daily in the maintenance cron): `docker compose exec web python manage.py reconcile_stripe_payments`. It checks the last 7 days of paid, refunded and disputed payments against Stripe, plus any refund, dispute or paid checkout Stripe recorded in that window. Each mismatch is printed with its payment and order ID, a Sentry error is sent (tag `area: payments_reconciliation`) and the run fails. Nothing is changed automatically: fix each line with `reconcile_checkout` or in the admin, then re-run. `--days 365` does a full sweep.
