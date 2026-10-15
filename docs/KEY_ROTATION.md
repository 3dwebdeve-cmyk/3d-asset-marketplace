# Key Rotation

Rotate every secret on a schedule, and immediately when a person with access leaves or a
leak is suspected. Rotate one secret at a time and confirm the site works before the next.

| Secret | Where it lives | Schedule | Effect on users |
|--------|----------------|----------|-----------------|
| R2 app token | app `.env` | 90 days | None |
| R2 backup token | `.env.backup` | 90 days | None |
| Stripe secret key | app `.env` | 180 days | None |
| Stripe webhook secret | app `.env` | 180 days | None if done in order |
| Brevo / SMTP key | app `.env` | 180 days | Mail pauses briefly |
| Database passwords | `.env` + Postgres | 180 days | Brief restart |
| `SECRET_KEY` | app `.env` | Only on suspected leak | Everyone signs in again |
| `MFA_SECRET_KEY` | app `.env` | Only on suspected leak | Every admin sets up 2FA again |
| Backup `age` key | offline | Only on suspected leak | Old backups need the old key |

Record each rotation in the log at the end.

## R2 tokens (app and backup)

1. Cloudflare → R2 → Manage R2 API Tokens → create a new token with the **same scope**
   as the old one (`R2_STAGING_CHECKLIST.md`, "API tokens").
2. Put the new key ID and secret in `.env` (app token) or `.env.backup` (backup token).
3. App token: restart (`docker compose up -d web worker`), then
   `docker compose exec web python manage.py verify_r2 --smoke-presign`.
   Backup token: run `BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh` once.
4. Delete the old token in Cloudflare.

## Stripe secret key

1. Stripe Dashboard → Developers → API keys → **Roll key**. Choose a short expiry for the
   old key (for example 1 hour) so in-flight requests finish.
2. Set `STRIPE_SECRET_KEY` and restart `web` and `worker`.
3. Run a test checkout in staging, or `python manage.py check_stripe_config` in production.

## Stripe webhook secret

1. Stripe Dashboard → Webhooks → your endpoint → **Roll secret**, with a short overlap.
2. Set `STRIPE_WEBHOOK_SECRET` and restart `web` within the overlap.
3. Send a test event from the dashboard and confirm it is accepted (HTTP 200).

## Email key (Brevo or SMTP)

Create the new key in the provider, set `BREVO_API_KEY` or `EMAIL_HOST_PASSWORD`, restart
`web` and `worker`, send a password-reset email to yourself, then revoke the old key.

## Database passwords

For each role (runtime and migration):

```
docker compose exec postgres psql -U <owner> -c "ALTER ROLE <role> PASSWORD '<new>';"
```

Update `DB_RUNTIME_PASSWORD` / `DB_MIGRATION_PASSWORD` (or `DB_PASSWORD`) in `.env`, then
`docker compose up -d migrate web worker` and check `/api/v1/healthz/`.

## Django SECRET_KEY

`SECRET_KEY` signs sessions and JWTs, so changing it signs **everyone** out. License
codes are stored, not derived from it, so certificates stay valid.

1. Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"` (at least 32 bytes).
2. Set `SECRET_KEY`, restart `web` and `worker`.
3. Sign in again and check the admin console.

## MFA_SECRET_KEY

Administrator authenticator secrets are derived from it. Changing it invalidates every
authenticator, so rotate only on a suspected leak:

1. Generate a new value (as for `SECRET_KEY`) and set `MFA_SECRET_KEY`.
2. For each administrator: `python manage.py reset_admin_mfa --email <email>`.
3. Restart `web`; each administrator sets up their authenticator at the next sign-in.

## Backup age key

Rotate only if the private key may be exposed.

1. `age-keygen -o marketplace-backup-key-<year>.txt` on a trusted machine; store it offline.
2. Set the new `BACKUP_AGE_RECIPIENT` in `.env.backup` on the backup host.
3. **Keep the old private key** until every backup made with it has expired (30 days);
   restores of older dumps still need it.

## Rotation log

| Date | Secret | Done by | Verified how |
|------|--------|---------|--------------|
|      |        |         |              |
