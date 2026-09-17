# Production checklist runbook — 3D Asset Marketplace

**Purpose:** Operator checklist to take Feature 13 Compose / images from “prod-like local” to a signed-off production host.  
**Does not replace:** live execution of these steps on the target environment.  
**Related:** root [`.env.example`](../.env.example), [`.cursor/Security_Checklist.md`](../.cursor/Security_Checklist.md), Feature 13 `docker-compose.yml`.

Compose and env templates intentionally default to safe local values (`EMAIL_BACKEND=console`, empty Stripe / R2 / Sentry). Production must override every item below.

---

## 0. Sign-off status

| Gate | Repo state | Live sign-off |
|------|------------|---------------|
| Feature 13 Docker / Gunicorn / Nginx | Done | — |
| This runbook | Done | — |
| Env secrets + SMTP + Stripe + R2 + Sentry on host | Templates only | Operator |
| `manage.py check --deploy` on host | Documented | Operator |
| Backup / restore drill | Documented | Operator |
| Stripe webhook endpoint test | Documented | Operator |
| Celery worker + real mail (not console) | Documented | Operator |
| Formal security / production Ready | Open until checklist executed | Operator |

---

## 1. Required environment (before first prod boot)

Copy root `.env.example` → `.env` on the host (never commit). Set:

### Core Django

| Variable | Production requirement |
|----------|------------------------|
| `DEBUG` | `False` (Compose `web` / `worker` already force `DEBUG=False`) |
| `SECRET_KEY` | Fresh random ≥ 32 bytes; never reuse the example string |
| `ALLOWED_HOSTS` | Public hostname(s) only (no `*`) |
| `FRONTEND_BASE_URL` | Public HTTPS origin of the SPA |
| `CORS_ALLOWED_ORIGINS` | Same SPA origin(s); no wildcards |
| `PUBLIC_API_BASE_URL` | Public HTTPS API origin (often same host as SPA via Nginx) |
| `CSRF_TRUSTED_ORIGINS` | `https://…` origins (required when `DEBUG=False`) |
| `SECURE_SSL_REDIRECT` | `True` when TLS terminates at Cloudflare / load balancer |
| `SECURE_HSTS_SECONDS` | `31536000` (or staged rollout) once HTTPS is confirmed |

### Redis

| Variable | Production requirement |
|----------|------------------------|
| `REDIS_URL` | Reachable Redis (Compose: `redis://redis:6379/1`). **Required** when `DEBUG=False` for shared cache, throttles, and Celery. |

### Email (must leave console)

| Variable | Production requirement |
|----------|------------------------|
| `EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | Real SMTP |
| `EMAIL_USE_TLS` | Typically `True` on 587 |
| `DEFAULT_FROM_EMAIL` | Verified sender domain |
| `PROJECT_MESSAGE_ADMIN_RECIPIENTS` / `CONTACT_ADMIN_RECIPIENTS` | Real staff inboxes |

### Stripe

| Variable | Production requirement |
|----------|------------------------|
| `STRIPE_SECRET_KEY` | `sk_live_…` for live; `sk_test_…` only on staging |
| `STRIPE_PUBLISHABLE_KEY` | Matching `pk_live_…` / `pk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | Endpoint signing secret from Stripe Dashboard |
| `E2E_STRIPE_SIMULATE` | Must be unset / `False` with live keys (settings refuse `sk_live_` + simulate) |

### Cloudflare R2 (both buckets)

| Variable | Production requirement |
|----------|------------------------|
| `R2_ACCOUNT_ID` | Set |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Scoped API token |
| `R2_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_PUBLIC_BUCKET` | Public / CDN bucket (thumbnails, preview GLBs) |
| `R2_PRIVATE_BUCKET` | Private bucket (paid packages) — **both** buckets required |
| `R2_PUBLIC_BASE_URL` | Public CDN / r2.dev base URL |
| `R2_SIGNED_URL_EXPIRY` | Short TTL (default 300s) |

### Sentry

| Variable | Production requirement |
|----------|------------------------|
| `SENTRY_DSN` | Django project DSN |
| `SENTRY_ENVIRONMENT` | `production` (or `staging`) |
| `SENTRY_TRACES_SAMPLE_RATE` | e.g. `0.1` |
| `VITE_SENTRY_DSN` | React project DSN (**bake at frontend image build**) |
| `VITE_SENTRY_ENVIRONMENT` / `VITE_SENTRY_TRACES_SAMPLE_RATE` | Match backend policy |
| `SENTRY_RELEASE` | Optional image tag / git SHA for release tracking |

### TLS at the proxy

- Terminate TLS at Cloudflare or a load balancer in front of the Compose Nginx port.
- Origin may speak HTTP to the container; Django trusts `X-Forwarded-Proto` when `DEBUG=False` (`SECURE_PROXY_SSL_HEADER`).
- Frontend Nginx forwards client `X-Forwarded-Proto` to Gunicorn when present.
- Confirm cookies (`Secure`) and HSTS only after HTTPS works end-to-end.
- Do not expose Postgres / Redis / Meilisearch / Gunicorn ports publicly — only the SPA/proxy port (or Cloudflare tunnel).

### Meilisearch / DB

| Variable | Production requirement |
|----------|------------------------|
| `DB_PASSWORD` | Strong unique password |
| `MEILI_MASTER_KEY` | ≥ 16 chars; not the example value |
| `MEILI_ENV` | `production` |

---

## 2. Pre-deploy verification commands

Run against the **production** `.env` / stack (adjust service names if you use a different orchestrator).

### 2.1 Django deploy checks

```bash
docker compose exec web python manage.py check --deploy
```

Expect **zero** issues. Common failures: missing `CSRF_TRUSTED_ORIGINS`, weak `SECRET_KEY`, `DEBUG=True`, insecure cookie flags.

Also useful:

```bash
docker compose exec web python manage.py check
docker compose exec web python -c "from django.conf import settings; assert settings.DEBUG is False; assert 'console' not in settings.EMAIL_BACKEND.lower(); print('DEBUG/email OK')"
```

### 2.2 Health

```bash
curl -fsS https://<public-host>/api/v1/healthz/
# Legacy alias (one release): /api/healthz/
```

Expect HTTP 200 and dependency probes healthy (DB / Redis / Meilisearch as implemented).

### 2.3 Celery worker running

```bash
docker compose ps worker
docker compose logs worker --tail=100
```

Worker must be `Up` / restarting only briefly. With Redis set, `CELERY_TASK_ALWAYS_EAGER` is false — email tasks must be consumed by this process, not only by Gunicorn.

Optional broker ping from web:

```bash
docker compose exec web celery -A config inspect ping
```

### 2.4 Mail leaves the console backend

1. Confirm env: `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` on **both** `web` and `worker`.
2. Trigger a low-risk mail path (password-reset or contact form) against a mailbox you control.
3. Confirm delivery in the inbox (not only container logs).
4. Worker logs must **not** show Django console-backend `Content-Type: text/plain` dumps as the sole delivery mechanism.

Fail the gate if mail only appears in `docker compose logs worker` with the console backend still configured.

### 2.5 Stripe webhook endpoint test

Canonical URL (versioned):

`POST https://<public-host>/api/v1/payments/webhook/`

Legacy alias (same handler for one release): `/api/payments/webhook/`

1. In Stripe Dashboard → Developers → Webhooks, add the HTTPS endpoint; subscribe to Checkout / payment events used by the app (at least `checkout.session.completed`).
2. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and recreate/restart `web` + `worker`.
3. Use Stripe CLI or Dashboard “Send test webhook” (staging with `sk_test_`), or a real test-mode checkout.
4. Expect HTTP 200 and a `StripeWebhookEvent` / fulfilled order (idempotent). Signature failures must return 400 without fulfilling.

Never point live webhooks at a host still using `E2E_STRIPE_SIMULATE=True`.

### 2.6 Backup and restore drill

**Backup (PostgreSQL volume):**

```bash
# Logical dump (preferred for drills)
docker compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "backup-$(date -u +%Y%m%dT%H%M%SZ).dump"

# Optional: stop writes briefly for a consistent volume snapshot of postgres_data
```

**Restore drill (staging or disposable volume — never overwrite prod without a freeze):**

```bash
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists < backup-YYYYMMDD.dump
docker compose exec web python manage.py migrate --noinput
curl -fsS https://<host>/api/v1/healthz/
```

Record: dump size, restore duration, whether migrations re-applied cleanly, and a smoke login / catalog browse. Schedule recurring backups before calling Production Ready.

R2 objects are **not** in Postgres — confirm separate R2 versioning / lifecycle / account recovery is understood.

---

## 3. Deploy sequence (summary)

1. Fill production `.env` (section 1).
2. Build and tag immutable images (section 4).
3. `docker compose up -d` (or pull tagged images on the host).
4. Confirm `web` healthcheck + `worker` process.
5. Run section 2 checks (`check --deploy`, healthz, mail, webhook, backup drill).
6. Soft-launch: Stripe **test** mode on a staging hostname first when possible; then cut DNS / live keys.
7. Watch Sentry for 24h; keep previous image tag for rollback.

---

## 4. Rollback policy

### 4.1 Application images

- Every production deploy **must** use an immutable tag (git SHA or semver), e.g. `ghcr.io/org/marketplace-web:2026-09-17-abc1234`.
- Avoid relying on `:latest` alone for rollback.
- To roll back **application code only** (no incompatible schema change):

  1. Point Compose / orchestrator at the previous known-good image tags for `web`, `worker`, and `frontend`.
  2. Recreate those services (`docker compose up -d --no-deps web worker frontend`).
  3. Confirm `/api/v1/healthz/` and a smoke purchase path.

### 4.2 Database migrations

- Prefer **expand/contract**: ship additive migrations first; remove columns/tables in a later release after code no longer reads them.
- Do **not** routinely `migrate` reverse on production.
- If a release includes a migration and must be aborted:

  | Situation | Action |
  |-----------|---------|
  | Migration not yet applied | Redeploy previous images; skip migrate |
  | Additive migration applied (new nullable column / new table unused by old code) | Roll back images only; leave DB forward (old code ignores new objects) |
  | Destructive / data-rewriting migration applied | **Do not** auto-reverse. Restore from the pre-deploy `pg_dump` / snapshot taken in section 2.6, then boot previous images |
  | Uncertain | Treat as destructive: restore backup |

- Document every prod migrate in the deploy ticket: migration names, backup filename, image tags before/after.
- Reversible migrations in the repo are for local/dev safety; production reverse is a last resort and must be rehearsed on a restore copy first.

### 4.3 Config / secrets rollback

- Keep the previous `.env` (or secret-manager version) for the last good release.
- Rolling back Stripe / R2 credentials independently of images can break signed URLs and webhooks — change secrets only with a coordinated cutover.

---

## 5. Security checklist mapping (pre-deploy)

Align with [`.cursor/Security_Checklist.md`](../.cursor/Security_Checklist.md):

- [ ] `DEBUG=False`; secrets only in env / secret manager
- [ ] HTTPS at edge; `SECURE_SSL_REDIRECT` + HSTS when ready
- [ ] JWT + httpOnly refresh cookies on HTTPS (`Secure`)
- [ ] Stripe verified server-side; webhook secret set; no frontend trust for payment success
- [ ] R2 private packages via short-lived signed URLs only
- [ ] Rate limits share Redis across workers
- [ ] Sentry DSNs set; no stack traces to clients (`DEBUG=False`)
- [ ] Ports restricted; DB/Redis/Meili not public
- [ ] Backup restore drill completed and dated
- [ ] Dependency / image updates current for the release

---

## 6. Definition of “Production Ready” for this repo

Mark `[x] Production Ready` / `[x] Production Deployment Complete` in `PROJECT_STATUS.md` only when:

1. Section 1 env is live (SMTP, Stripe, both R2 buckets, Sentry, Redis, TLS).
2. Section 2 commands succeed on the production (or identical staging) host, including backup restore drill and webhook test.
3. Worker is healthy and real mail is delivered.
4. Rollback image tags + backup artifact for the release are recorded.
5. A human security review against `.cursor/Security_Checklist.md` is signed for that release.
