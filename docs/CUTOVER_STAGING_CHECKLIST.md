# Cutover staging → production checklist (Phase K1)

**Severity:** BLOCKER (launch gate)  
**Source of truth:** [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §§1–4  
**Related:** rollback [`ROLLBACK_REHEARSAL.md`](ROLLBACK_REHEARSAL.md), security [`SECURITY_SMOKE_CHECKLIST.md`](SECURITY_SMOKE_CHECKLIST.md)

This document is the **operator runbook** for executing the full production checklist on **staging first**, then **production**. Repo tooling automates §2 config/health gates; DNS, live Stripe, TLS, and the 24h Sentry watch remain human steps.

---

## 0. What “complete” means

| Environment | Complete when |
|-------------|----------------|
| **Staging** | §1 env filled for staging hostname; immutable images up; `check_cutover --profile staging` OK; §2 mail/webhook/backup/security smokes dated; Stripe **test** soft-launch on staging hostname |
| **Production** | Same with production hostname; `check_cutover --profile production` OK; live Stripe keys + live webhook; DNS cut; Sentry watched ~24h; previous image tags recorded |

Do **not** mark staging/prod complete in `implementingFIXfeature.md` until the sign-off tables below are dated.

---

## 1. Fill host `.env` (PRODUCTION_CHECKLIST §1)

Copy root `.env.example` → `.env` on the host (never commit). Set every block:

| Block | Staging | Production |
|-------|---------|------------|
| Secrets / hosts / TLS | Public staging host; `DEBUG=False`; `ALLOW_LOCALHOST_FRONTEND=False` | Same for live domain; `SECURE_SSL_REDIRECT=True`; HSTS after HTTPS works |
| Redis | DB1 cache + DB0 broker | Same |
| SMTP | Real SMTP preferred; Phase A3 may still be deferred — use `--require-smtp` when ready | **Required** (`ALLOW_CONSOLE_EMAIL=False`) |
| Stripe | `sk_test_` / `pk_test_` + test webhook secret | `sk_live_` / `pk_live_` + live webhook secret; `E2E_STRIPE_SIMULATE` unset |
| R2 | Both buckets + `R2_PUBLIC_BASE_URL` | Same |
| Sentry | DSN + `SENTRY_ENVIRONMENT=staging`; bake `VITE_SENTRY_DSN` | `SENTRY_ENVIRONMENT=production`; set `SENTRY_RELEASE` to image tag |
| Meili / DB | Strong passwords; `MEILI_ENV=production` | Same |

Child runbooks: [`DEPLOY_SECRETS_STAGING_CHECKLIST.md`](DEPLOY_SECRETS_STAGING_CHECKLIST.md), [`SMTP_STAGING_CHECKLIST.md`](SMTP_STAGING_CHECKLIST.md), [`STRIPE_SANDBOX_CHECKLIST.md`](STRIPE_SANDBOX_CHECKLIST.md), [`R2_STAGING_CHECKLIST.md`](R2_STAGING_CHECKLIST.md), [`SENTRY_STAGING_CHECKLIST.md`](SENTRY_STAGING_CHECKLIST.md), [`AUTH_STAGING_CHECKLIST.md`](AUTH_STAGING_CHECKLIST.md).

---

## 2. Build / tag immutable images (§3–4)

```bash
# Linux/macOS
./backend/scripts/build_immutable_images.sh
# Windows
.\backend\scripts\build_immutable_images.ps1

# Optional registry:
# IMAGE_REGISTRY=ghcr.io/org PUSH=1 ./backend/scripts/build_immutable_images.sh

docker compose up -d
docker compose ps   # web healthy; worker Up
```

Compose uses `WEB_IMAGE` (web + worker) and `FRONTEND_IMAGE`. Do **not** rely on `:latest` alone for rollback.

Record tags in the deploy ticket:

| Field | Value |
|-------|-------|
| `IMAGE_TAG` | |
| `WEB_IMAGE` | |
| `FRONTEND_IMAGE` | |
| Previous known-good tags | |

---

## 3. Automated §2 gate (`check_cutover`)

Reuses existing collectors (`deploy_checks`, Stripe report, healthz, Meili probe, etc.). Does **not** print secrets.

```bash
# Local DX / CI-ish (advisory host gates):
python manage.py check_cutover --profile local --skip-django-deploy-check

# Staging host (test Stripe):
docker compose exec web python manage.py check_cutover --profile staging --fail-on-warnings
# When A3 SMTP is ready:
docker compose exec web python manage.py check_cutover --profile staging --require-smtp --require-sentry --fail-on-warnings

# Production host (live Stripe + SMTP + Sentry required):
docker compose exec web python manage.py check_cutover --profile production --fail-on-warnings
```

| Gate | Command / action |
|------|------------------|
| Deploy secrets | included in `check_cutover` + `check_deploy_config --django-deploy-check` |
| Healthz | included; also `curl -fsS https://<host>/api/v1/healthz/` |
| Search | included; also `reindex_search` after catalog changes |
| Auth / ops | included; `ensure_administrator` if needed |
| Mail | gate + `check_email_config --send-test-email` |
| Stripe webhook | staging: `check_stripe_config --require-test-mode --smoke-fulfill`; prod: live Dashboard endpoint |
| R2 | `verify_r2 --smoke-presign`; `audit_published_packages --fail-on-missing` |
| Backup | `backup_postgres.sh` + `restore_postgres_drill.sh`; `install_backup_cron.sh` on Linux host |
| Security | `check_security_smoke --fail-on-warnings` |
| WAF | `check_waf_readiness`; Cloudflare dashboard per [`CLOUDFLARE_WAF_CHECKLIST.md`](CLOUDFLARE_WAF_CHECKLIST.md) |
| Worker | `docker compose ps worker`; Celery inspect ping (Compose healthcheck) |

---

## 4. Soft-launch → DNS → live keys (§3 steps 6–7)

1. Soft-launch on **staging hostname** with Stripe **test** mode; one paid test checkout + entitlement download.
2. Confirm worker delivers mail (or console only if A3 still deferred — do not public-launch without SMTP).
3. Production: switch DNS / Cloudflare proxied; set live Stripe keys + webhook; recreate web/worker.
4. Watch Sentry ~24h; keep previous `WEB_IMAGE` / `FRONTEND_IMAGE` ready; rehearse rollback on staging ([`ROLLBACK_REHEARSAL.md`](ROLLBACK_REHEARSAL.md) — `rollback_compose` + `check_rollback_rehearsal`).

---

## 5. Sign-off tables

### Staging

| Item | Date | Initials |
|------|------|----------|
| §1 env filled (staging host) | | |
| Immutable images built + recorded | | |
| `web` healthy + `worker` Up | | |
| `check_cutover --profile staging` OK | | |
| Mail / webhook / R2 / backup smokes | | |
| Security smoke (`DEBUG=False`) | | |
| Soft-launch Stripe **test** checkout | | |
| K2 rollback rehearsal ([`ROLLBACK_REHEARSAL.md`](ROLLBACK_REHEARSAL.md)) | | |
| Staging complete | | |

### Production

| Item | Date | Initials |
|------|------|----------|
| §1 env filled (prod host) | | |
| Immutable images built + recorded | | |
| `check_cutover --profile production` OK | | |
| Live Stripe keys + webhook | | |
| DNS / TLS cut | | |
| Sentry ~24h watch (no launch blockers) | | |
| Previous tags kept for rollback | | |
| K2 rollback rehearsal dated ([`ROLLBACK_REHEARSAL.md`](ROLLBACK_REHEARSAL.md)) | | |
| Production complete | | |

---

## 6. Local tooling smoke (repo — not host complete)

| Item | Date | Initials |
|------|------|----------|
| `check_cutover --profile local` OK | 2026-09-19 | Auto |
| Immutable image script present (`.sh` + `.ps1`) | 2026-09-19 | Auto |
| Compose `WEB_IMAGE` / `FRONTEND_IMAGE` wired | 2026-09-19 | Auto |
| Unit tests `config.test_cutover_gate` | 2026-09-19 | Auto |

---

## Definition of Done (this phase tooling)

- [x] `check_cutover` + `config.cutover_gate` reuse existing checkers  
- [x] Immutable image build helpers + Compose image name tags  
- [x] This runbook + PRODUCTION_CHECKLIST links  
- [ ] Staging sign-off table dated (operator)  
- [ ] Production sign-off table dated (operator)  
