# Sentry staging checklist (Phase H1)

**Scope:** Wire Django + Celery and the React SPA to Sentry with PII scrubbing, then verify a test event arrives.

**Related:** `docs/PRODUCTION_CHECKLIST.md` §1 Sentry / §2.2c, `backend/config/sentry.py`, `frontend/src/lib/sentry.ts`, `python manage.py check_sentry_config`.

SDK init is already in the repo (no-op when DSNs are blank). This checklist is **operator configuration + smoke**.

---

## 1. Create projects at sentry.io

Create **two** projects (separate DSNs):

| Surface | Platform | Env var |
|---------|----------|---------|
| Django API + Celery worker | Python / Django | `SENTRY_DSN` |
| React SPA | React / Browser | `VITE_SENTRY_DSN` |

Do **not** reuse one DSN for both — browser and server noise stay separable.

---

## 2. Backend env

```env
# backend/.env or Compose host .env
SENTRY_DSN=https://…@o….ingest.sentry.io/…
SENTRY_ENVIRONMENT=staging
SENTRY_TRACES_SAMPLE_RATE=0.1
# Optional release tag (image tag / git SHA)
# SENTRY_RELEASE=3d-asset-marketplace@staging-…
```

Restart **web and worker** so both processes init the SDK (`settings.py` calls `init_sentry` when DSN is set).

```bash
cd backend
python manage.py check_sentry_config
python manage.py check_sentry_config --send-test-event
```

Expect `SENTRY_DSN_set=True` and the test info event in the Django Sentry project.

On staging/prod with `DEBUG=False`:

```bash
python manage.py check_sentry_config --fail-on-warnings
```

---

## 3. Frontend env (bake at build)

Vite embeds `VITE_*` at **build** time — setting them only in the running container after `npm run build` does nothing.

```env
# frontend/.env for Vite local, or Compose build-args
VITE_SENTRY_DSN=https://…@o….ingest.sentry.io/…
VITE_SENTRY_ENVIRONMENT=staging
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
```

- Local: restart `npm run dev` after changing `VITE_*`.
- Compose/prod: rebuild the frontend image so Nginx serves a bundle that includes the DSN.

Smoke: open the SPA, trigger a handled client error (or temporarily throw in a page), confirm an event in the **React** Sentry project. Existing scrubbers strip tokens/emails (`sendDefaultPii: false`).

---

## 4. What is already wired (do not reinvent)

| Piece | Location |
|-------|----------|
| Django/Celery init + scrubber | `backend/config/sentry.py` |
| Stripe webhook failure capture | `payments/views.py` → `capture_webhook_failure` |
| React init + scrub + logger bridge | `frontend/src/lib/sentry.ts`, `logger.ts` |
| ErrorBoundary → Sentry | `frontend/src/components/ErrorBoundary.tsx` |
| Compose env pass-through | `docker-compose.yml` web/worker/frontend build |

Do not add a second APM unless product explicitly requires it.

---

## 5. Sign-off

- [ ] Django DSN set; `check_sentry_config --send-test-event` visible in Sentry  
- [ ] Frontend rebuilt with `VITE_SENTRY_DSN`; browser test event visible  
- [ ] `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` match staging or production  
- [ ] No secrets/PII in sample events (spot-check request headers / extras)  
