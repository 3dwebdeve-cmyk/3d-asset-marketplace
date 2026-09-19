# Auth & accounts staging checklist (Phase D)

**Scope:** First Administrator, optional Google Sign-In pairing, and confirmation that verification / password-reset emails use the public SPA origin (`FRONTEND_BASE_URL`).

**Related:** `docs/PRODUCTION_CHECKLIST.md`, `python manage.py ensure_administrator`, `python manage.py check_auth_config`, `python manage.py verify_email`.

---

## 1. First Administrator

```bash
cd backend
python manage.py ensure_administrator --email ops@example.com --password 'ChooseAStrongPass!' --full-name 'Ops Admin'
# or classic:
# python manage.py createsuperuser
```

Then sign in at `/console/login` (SPA) with that email/password.

Confirm:

```bash
python manage.py check_auth_config
```

Expect `active_administrators` ≥ 1.

---

## 2. Google Sign-In (optional — skip if unused)

Backend and frontend must use the **same** Google Cloud **Web** client ID.

```env
# backend/.env
GOOGLE_OAUTH_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
```

```env
# frontend/.env  (Vite — bake at build / restart npm run dev)
VITE_GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
```

Authorized JavaScript origins in Google Cloud Console must include your SPA origin (`http://localhost:5173` locally, `https://…` on staging/prod).

Restart Vite after changing `VITE_*`. Rebuild the frontend image for Compose/prod.

Smoke: customer Google button on register/login → session; administrators still use `/console/login` (password only).

---

## 3. FRONTEND_BASE_URL (verification links)

Verification and password-reset emails are built from `FRONTEND_BASE_URL` (see `config.mail.frontend_base_url`).

| Env | Expected value |
|-----|----------------|
| Local Vite | `http://localhost:5173` (or matching Vite origin) |
| Staging / prod | `https://<public-spa-origin>` — **not** localhost |

When `DEBUG=False`, settings refuse a localhost `FRONTEND_BASE_URL` unless `ALLOW_LOCALHOST_FRONTEND=True` (local-only escape hatch). On staging/prod keep `ALLOW_LOCALHOST_FRONTEND=False` and use **https**.

```bash
python manage.py check_auth_config
# Staging/prod gate:
python manage.py check_auth_config --fail-on-warnings
```

Expect sample paths like:

- `{FRONTEND_BASE_URL}/verify-email/<uid>/<token>`
- `{FRONTEND_BASE_URL}/reset-password/<uid>/<token>`

Smoke:

1. Register a new customer (or resend verification).
2. With console email: copy the `EMAIL VERIFICATION LINK` from the backend log; with SMTP: open the inbox link.
3. Confirm the link host matches `FRONTEND_BASE_URL` and completes verification on mobile + desktop.
4. Optional: request password reset and confirm the reset link host matches the same origin.
5. Optional local bypass without SMTP: `python manage.py verify_email you@example.com`

Also keep `CORS_ALLOWED_ORIGINS` aligned with the same SPA origin(s).

---

## 4. Auth smoke matrix

- [x] Local: Register → verify → login
- [x] Local: Admin `/console/login` → console home
- [x] Local: Google customer button renders (IDs paired); full Google account login optional
- [x] Local: Password reset request → 200 (link host uses `FRONTEND_BASE_URL`; confirm flow covered by unit tests)
- [x] Local (2026-09-19): Verification + password-reset emails use `FRONTEND_BASE_URL` (console/outbox host check + desktop verify-email open)
- [ ] Staging/prod: full matrix including inbox verification + interactive Google

---

## Operator checkboxes

- [x] Local (2026-09-19): `ensure_administrator` done; console login + home smoke works
- [x] Local (2026-09-19): Google IDs matched BE↔FE; GIS button renders (full Google account login optional)
- [x] Local (2026-09-19): `check_auth_config` reports `FRONTEND_BASE_URL` + sample verify/reset paths; verification/reset link host matches; desktop verify completes
- [ ] Staging/prod: `ensure_administrator` on host; Google authorized origins + Compose Google vars / frontend rebuild
- [ ] Staging/prod `FRONTEND_BASE_URL=https://<public-spa-origin>`; `ALLOW_LOCALHOST_FRONTEND=False`; `check_auth_config --fail-on-warnings` clean
- [ ] One real verification email opened successfully on phone + desktop (requires SMTP — see `docs/SMTP_STAGING_CHECKLIST.md`)
- [ ] Password-reset inbox link host matches public origin (same gate)