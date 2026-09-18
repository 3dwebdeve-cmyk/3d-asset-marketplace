# Security smoke checklist (Phase H2)

**Scope:** Formal host smoke aligned with [`.cursor/Security_Checklist.md`](../.cursor/Security_Checklist.md) and [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §5.

**Does not replace:** executing these checks on staging/prod and recording date/initials in the production sign-off table.

---

## 1. Deploy hygiene

```bash
docker compose exec web python manage.py check --deploy
```

Expect **zero** issues. Confirm `DEBUG=False`, HTTPS at the edge, Secure cookies.

---

## 2. Auth / throttle

1. Attempt login with wrong password ~6 times → expect **429** (`code=throttled`).
2. Valid login after wait → 200 + session.
3. Unverified buyer cannot checkout (403 `email_not_verified`) when verification is required.

---

## 3. Downloads / storage

1. Unauthenticated `GET /api/v1/downloads/…` entitlement or signed download → **401**.
2. Authenticated user **without** purchase → **403** / not entitled.
3. Private object URL without signature → denied at R2 / app.
4. Paid entitlement → short-lived signed JSON only; **no** `storage_path` in public APIs.

```bash
docker compose exec web python manage.py audit_published_packages --fail-on-missing
docker compose exec web python manage.py verify_r2
```

---

## 4. Payments webhook

1. `POST /api/v1/payments/webhook/` with bad / missing Stripe signature → **400**, no fulfill.
2. Replay a processed event → idempotent (no double entitlement).
3. See [`STRIPE_SANDBOX_CHECKLIST.md`](STRIPE_SANDBOX_CHECKLIST.md).

---

## 5. CORS / CSRF / admin

1. Browser origin outside `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` fails credentialed calls.
2. Django admin at `/admin/` locked down (strong password / VPN / disable if unused).
3. SPA console at `/console/` — staff only (`AdminRoute`).

---

## 6. Sign-off

Record date + initials in `docs/PRODUCTION_CHECKLIST.md` §0 / §5 when complete on the host.

| Check | Staging | Production |
|-------|---------|------------|
| `check --deploy` clean | | |
| Login throttle | | |
| Unauth download denied | | |
| Bad webhook → 400 | | |
| CORS/CSRF allowlist | | |
| Django admin locked | | |
