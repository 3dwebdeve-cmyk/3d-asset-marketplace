# Security smoke checklist (Phase H2)

**Scope:** Formal host smoke aligned with [`.cursor/Security_Checklist.md`](../.cursor/Security_Checklist.md) and [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §5.

**Does not replace:** executing these checks on staging/prod with `DEBUG=False` + HTTPS and recording date/initials in the production sign-off table.

---

## 0. Automated runner (preferred)

From `backend/` (venv active):

```bash
python manage.py check_security_smoke
# Staging/prod gate (also fails on DEBUG=True advisory):
python manage.py check_security_smoke --fail-on-warnings
# Skip embedded Django check --deploy if you already ran it separately:
python manage.py check_security_smoke --skip-django-deploy-check
```

Compose:

```bash
docker compose exec web python manage.py check_security_smoke --fail-on-warnings
```

The command reuses existing controls (login throttle, download auth, Stripe webhook signature, `serve_public_media` private deny, CORS/CSRF settings, Django `/admin/` login redirect). It does **not** print secrets.

| Check id | What it asserts |
|----------|-----------------|
| `deploy_hygiene` | DEBUG / SSL redirect / HSTS / Secure cookies; optional `check --deploy` |
| `login_throttle` | Wrong password then 429 `code=throttled` |
| `unauth_download` | Product file download without JWT → 401 |
| `unsigned_private_object` | `products/files/…` not public; `/media/…` denied |
| `bad_webhook_signature` | Bad `Stripe-Signature` → 400; no payment/event fulfill |
| `cors_csrf_allowlist` | No CORS `*`; CSRF trusted origins when `DEBUG=False` |
| `django_admin_locked` | Unauthenticated `/admin/` → login redirect, 403 allowlist, or 404 if disabled |
| `openapi_gated` | Schema 200 when `DEBUG=True`; anonymous 401/403 when `DEBUG=False` |

**Local result (2026-09-19, operator Auto):** `security_smoke OK` with `DEBUG=True` (deploy hygiene advisory — expected). Staging/prod must re-run with `--fail-on-warnings` after `DEBUG=False` + HTTPS.

---

## 1. Deploy hygiene

```bash
python manage.py check --deploy
# or:
python manage.py check_deploy_config --django-deploy-check --fail-on-warnings
```

Expect **zero** issues when `DEBUG=False`. Confirm HTTPS at the edge and Secure cookies (`SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE`).

---

## 2. Auth / throttle

Covered by `check_security_smoke` (`login_throttle`). Manual alternative:

1. Attempt login with wrong password ~6 times → expect **429** (`code=throttled`).
2. Valid login after wait → 200 + session.
3. Unverified buyer cannot checkout (403 `email_not_verified`) when verification is required.

---

## 3. Downloads / storage

Covered by `check_security_smoke` (`unauth_download`, `unsigned_private_object`). Manual / R2 extras:

1. Unauthenticated `GET /api/v1/downloads/…` → **401**.
2. Authenticated user **without** purchase → **403** / not entitled.
3. Private object URL without signature → denied at R2 / app.
4. Paid entitlement → short-lived signed JSON only; **no** `storage_path` in public APIs.

```bash
docker compose exec web python manage.py audit_published_packages --fail-on-missing
docker compose exec web python manage.py verify_r2 --smoke-presign
```

---

## 4. Payments webhook

Covered by `check_security_smoke` (`bad_webhook_signature`). Also:

1. Replay a processed event → idempotent (no double entitlement) — see `check_stripe_config --smoke-fulfill`.
2. [`STRIPE_SANDBOX_CHECKLIST.md`](STRIPE_SANDBOX_CHECKLIST.md).

---

## 5. CORS / CSRF / admin

Covered by `check_security_smoke` (`cors_csrf_allowlist`, `django_admin_locked`).

1. Browser origin outside `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` fails credentialed calls.
2. Django admin at `/admin/` locked down (strong password / VPN / disable if unused).
3. SPA console at `/console/` — staff only (`AdminRoute`).

---

## 6. Sign-off

Record date + initials in `docs/PRODUCTION_CHECKLIST.md` §0 / §5 when complete on the host.

| Check | Local (2026-09-19) | Staging | Production |
|-------|--------------------|---------|------------|
| `check_security_smoke` / `check --deploy` | OK (DEBUG=True advisory) | | |
| Login throttle | OK | | |
| Unauth download denied | OK | | |
| Unsigned private denied | OK | | |
| Bad webhook → 400 | OK | | |
| CORS/CSRF allowlist | OK | | |
| Django admin locked | OK | | |
