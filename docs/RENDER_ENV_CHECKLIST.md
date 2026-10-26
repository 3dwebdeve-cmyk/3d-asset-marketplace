# Render environment checklist (backend web service)

Names only, never values. Check each one in Render → the backend service → Environment before
you deploy a new version. `production` mode refuses to start when a required value is missing
or weak, so a gap shows up as a failed deploy; read the Render log for the exact message.

## Required (the service will not start, or the startup check fails, without them)

| Name | Notes |
|---|---|
| `DEBUG` | `False` |
| `DEPLOYMENT_PROFILE` | `production` or `staging`. Also decides whether admin uploads need a virus scanner (`PACKAGE_SCAN_REQUIRED` is on for both) |
| `SECRET_KEY` | Long and random, not an example value |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | From the Render Postgres page |
| `ALLOWED_HOSTS` | The Render host name |
| `FRONTEND_BASE_URL` | The public site address (`https://...`), used in email links |
| `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Only the public site address (`https://...`, no trailing `/`). The site calls the API through its own address, so it needs no other entry: remove old test addresses (`*.workers.dev`, `*.pages.dev`, `localhost`) and the `www.` address, which only redirects |
| `JWT_REFRESH_COOKIE_SECURE` | `True` |
| `BREVO_API_KEY`, `DEFAULT_FROM_EMAIL` | Without a real email backend the app refuses to start. The sender must be an address on the shop's own domain, authenticated in Brevo (`EMAIL_DOMAIN_SETUP.md`) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PAYMENT_MODE` | `test` until the company account is live; switching: `STRIPE_LIVE_CHECKLIST.md` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT_URL`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL` | Model and image storage |
| `DJANGO_ADMIN_ENABLED` | `False` in production (refused otherwise) |
| One of `ADMIN_CONSOLE_ALLOWED_IPS` or `ADMIN_CONSOLE_IP_LOCK_OFF=true` | The admin IP list, or the deliberate opt-out |
| `SENTRY_DSN` | The production startup check fails without it, unless `SKIP_STARTUP_CUTOVER=true` |

## Needed for this release's security features

| Name | Notes |
|---|---|
| `EDGE_SHARED_SECRET` | At least 32 characters; the same value as the Worker secret |
| `EDGE_REQUIRE` | `true` once the Worker sends the secret |
| `R2_SIGNED_URL_EXPIRY` | `60` (or leave unset for the default) |
| `MFA_SECRET_KEY` | Optional but recommended: a separate long random value. Falls back to `SECRET_KEY`. Changing it later resets every administrator's authenticator |
| `STRIPE_WEBHOOK_SECRET` | When the Stripe webhook exists |
| `CATALOG_INGEST_ALLOWED_IPS` | Optional. IPs/CIDRs allowed to call the uploader exe's `/api/v1/catalog-ingest/` route (API key still required). Empty = any IP. See `batch-ingest-contract.md` |

## Free-plan helpers (switch on the things Render's free plan lacks)

| Name | What it does |
|---|---|
| `RUN_BACKGROUND_JOBS_IN_WEB=true` | Sends the queued emails (verification, password reset, orders, security notices) |
| `RUN_MAINTENANCE_LOOP_IN_WEB=true` | Daily housekeeping: prune old records, payment checks, the Stripe comparison once the account is live, then the daily report email |
| `OPS_REPORT_RECIPIENTS` | Team inboxes for the daily report, comma separated (empty = every active Administrator). See `RUNBOOK.md` |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` | Creates the first administrator at startup (no shell on the free plan). Create-only: never resets a password and never promotes an existing customer. Password at least 12 characters and not a common or breached one. **Delete `BOOTSTRAP_ADMIN_PASSWORD` after the first successful deploy** |

## Do not set on Render

- Anything starting `R2_BACKUP_` (the app refuses to start if the backup key reaches it)
- `ADMIN_MFA_REQUIRED=False`, `ALLOW_CONSOLE_EMAIL`, `ALLOW_LOCALHOST_FRONTEND`, `E2E_STRIPE_SIMULATE`

## Backups

Render's paid Postgres plans include automatic backups; the free plan has none and expires after
about 30 days. The `age`/R2 backup scripts in `backend/scripts/` are for self-hosting with Docker and
are not used on Render. Confirm the retention of the plan you buy. Manual copies and the restore
rehearsal: `RENDER_BACKUP_RESTORE.md`.
