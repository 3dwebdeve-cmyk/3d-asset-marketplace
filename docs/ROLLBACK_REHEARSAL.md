# Rollback rehearsal (Phase K2)

**Severity:** MUST  
**Related:** [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §4, [`CUTOVER_STAGING_CHECKLIST.md`](CUTOVER_STAGING_CHECKLIST.md), immutable build helpers `backend/scripts/build_immutable_images.sh` / `.ps1`

Practice once on **staging** before production cutover. Bad Friday deploys with no practiced rollback can break checkout.

This document is the **operator runbook**. Repo tooling automates post-rollback healthz + purchase path + webhook idempotency checks; Compose image swap and backup remain human steps.

---

## 0. What “complete” means

| Environment | Complete when |
|-------------|----------------|
| **Local (tooling)** | `check_rollback_rehearsal --profile local` OK; rollback scripts present; unit tests green |
| **Staging** | Immutable tags A/B recorded; Compose rolled back to A with `--no-deps`; healthz + purchase + webhook idempotency dated below; previous `.env` kept |
| **Production** | Same pattern rehearsed on staging first; prod rollback only if needed (do not invent a second unpracticed path) |

Do **not** mark staging complete in `implementingFIXfeature.md` until the sign-off table is dated.

---

## 1. Preconditions

1. Deploy with **immutable** image tags (git SHA or semver), not only `:latest`.
   - Build: `./backend/scripts/build_immutable_images.sh` (or `.ps1`)
   - Compose uses `WEB_IMAGE` (web + worker) and `FRONTEND_IMAGE`
2. Take a Postgres backup (`backend/scripts/backup_postgres.sh`) before the rehearsal deploy (tag B).
3. Keep the previous `.env` (or secret-manager version) for the last good release (tag A).
4. Note that Stripe webhook idempotency is DB-backed (`StripeWebhookEvent.stripe_event_id` unique) — rows survive image rollback.

---

## 2. Rehearsal steps (staging)

### 2.1 Record tags

| Field | Tag A (known good) | Tag B (rehearsal “bad” / new) |
|-------|--------------------|------------------------------|
| `IMAGE_TAG` | | |
| `WEB_IMAGE` | | |
| `FRONTEND_IMAGE` | | |
| `.env` / secrets version | | |

### 2.2 Deploy tag B

```bash
export WEB_IMAGE=<tag-B-web>
export FRONTEND_IMAGE=<tag-B-frontend>
docker compose up -d --no-deps --force-recreate web worker frontend
# Smoke: healthz + login (optional)
```

### 2.3 Roll back to tag A (`--no-deps`)

```bash
# Linux/macOS
export PREVIOUS_WEB_IMAGE=<tag-A-web>
export PREVIOUS_FRONTEND_IMAGE=<tag-A-frontend>
./backend/scripts/rollback_compose.sh

# Windows PowerShell
$env:PREVIOUS_WEB_IMAGE = "<tag-A-web>"
$env:PREVIOUS_FRONTEND_IMAGE = "<tag-A-frontend>"
.\backend\scripts\rollback_compose.ps1
```

Equivalent manual:

```bash
export WEB_IMAGE=<tag-A-web>
export FRONTEND_IMAGE=<tag-A-frontend>
docker compose up -d --no-deps --force-recreate web worker frontend
```

Postgres / Redis / Meilisearch stay up — **do not** reverse destructive migrations. Prefer expand/contract, or restore from the pre-deploy dump (PRODUCTION_CHECKLIST §4.2).

### 2.4 Confirm healthz + purchase + webhook idempotency

```bash
curl -fsS https://<staging-host>/api/v1/healthz/

docker compose exec web python manage.py check_rollback_rehearsal \
  --profile staging --fail-on-warnings

# Optional: live sk_test_ Checkout Session + signed fulfill + replay
docker compose exec web python manage.py check_rollback_rehearsal \
  --profile staging --smoke-webhook --fail-on-warnings
```

| Check id | What it asserts |
|----------|-----------------|
| `immutable_tags` | `WEB_IMAGE` / `FRONTEND_IMAGE` are not `:latest` (blocking on staging when set) |
| `healthz` | `GET /api/v1/healthz/` → 200 JSON |
| `purchase_path` | Auth checkout session create (Stripe `Session.create` **mocked** — no live charge) |
| `webhook_idempotency` | Fulfill + replay → one `StripeWebhookEvent`, one succeeded payment, entitlement held |
| `sandbox_webhook_smoke` | Optional `--smoke-webhook`: real `sk_test_` session + signed webhook + replay |

---

## 3. Migration / secrets policy (do not skip)

| Situation | Action |
|-----------|--------|
| No migrate in tag B | Image rollback only |
| Additive migrate applied | Image rollback only; leave DB forward |
| Destructive migrate applied | **Do not** `migrate` reverse — restore pre-deploy dump, then boot tag A |
| Stripe / R2 secrets changed with B | Restore previous `.env` / secret-manager version with the image rollback (coordinated) |

---

## 4. Sign-off

### Staging rehearsal

| Item | Staging date | Initials |
|------|--------------|----------|
| Immutable tags A/B recorded | | |
| Postgres backup before tag B | | |
| Previous `.env` / secrets version kept | | |
| Rollback to A via `--no-deps` (script or Compose) | | |
| `check_rollback_rehearsal --profile staging` OK | | |
| Healthz + purchase path after rollback | | |
| Webhook idempotency OK (gate and/or `--smoke-webhook`) | | |
| No migrate reverse used | | |
| Staging rehearsal complete | | |

### Local tooling (repo — not host complete)

| Item | Date | Initials |
|------|------|----------|
| `check_rollback_rehearsal --profile local` OK | 2026-09-19 | Auto |
| `rollback_compose.sh` + `.ps1` present | 2026-09-19 | Auto |
| Unit tests `config.test_rollback_rehearsal` | 2026-09-19 | Auto |

---

## 5. Definition of Done (this phase tooling)

- [x] Expanded runbook with `--no-deps` steps + migration/secrets policy  
- [x] `check_rollback_rehearsal` + `config.rollback_rehearsal`  
- [x] Compose rollback helpers (refuse `:latest`)  
- [x] PRODUCTION_CHECKLIST / CUTOVER links  
- [ ] Staging sign-off table dated (operator)  
