# SMTP staging checklist (Phase A3)

**Scope:** Leave the Django console email backend, configure real SMTP on **web and worker**, set staff recipient env vars, and prove one message reaches an inbox you control.

**Related:** `docs/PRODUCTION_CHECKLIST.md` §1 Email / §2.4, `backend/config/settings.py` (`ALLOW_CONSOLE_EMAIL` boot guard), `python manage.py check_email_config`.

Mail sending itself is already wired (Celery tasks + `enqueue_after_commit`). This checklist is **operator configuration + smoke** — do not rewrite mail stacks.

---

## 1. Env on web **and** worker

Both processes must share the same `EMAIL_*` (Compose passes them from the host `.env`).

```env
DEBUG=False
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
ALLOW_CONSOLE_EMAIL=False
DEFAULT_FROM_EMAIL=noreply@your-domain.example
EMAIL_HOST=smtp.your-provider.example
EMAIL_PORT=587
EMAIL_HOST_USER=…
EMAIL_HOST_PASSWORD=…
EMAIL_USE_TLS=True
PROJECT_MESSAGE_ADMIN_RECIPIENTS=ops@your-domain.example
CONTACT_ADMIN_RECIPIENTS=support@your-domain.example
```

| Variable | Notes |
|----------|--------|
| `ALLOW_CONSOLE_EMAIL` | Must be `False` (or unset with `DEBUG=False`) so console backend cannot boot |
| `DEFAULT_FROM_EMAIL` | Use a sender your provider has verified |
| Recipients | Comma-separated; used by contact form + custom-project staff alerts |

Local Compose may keep `EMAIL_BACKEND=console` + `ALLOW_CONSOLE_EMAIL=True` for development. Staging/prod must not.

Restart **web and worker** after changing email env:

```bash
docker compose up -d --force-recreate web worker
```

---

## 2. Config check

```bash
# From backend venv / Compose web:
python manage.py check_email_config
python manage.py check_email_config --fail-on-warnings
python manage.py check_email_config --send-test-email you@example.com
```

Expect:

- `EMAIL_BACKEND=…smtp.EmailBackend`
- `ALLOW_CONSOLE_EMAIL=False`
- `EMAIL_HOST_set=True`
- Recipients counts ≥ 1 when `DEBUG=False`
- Test message arrives in your inbox (not only container logs)

Compose:

```bash
docker compose exec web python manage.py check_email_config --fail-on-warnings
docker compose exec web python manage.py check_email_config --send-test-email you@example.com
```

Also confirm the worker sees the same backend (same env / same Compose service env block).

---

## 3. Product-path smoke (after SMTP works)

1. Password-reset or register → verification email reaches inbox; link uses public `FRONTEND_BASE_URL` (see [`AUTH_STAGING_CHECKLIST.md`](AUTH_STAGING_CHECKLIST.md)).
2. Public contact form → staff inbox (`CONTACT_ADMIN_RECIPIENTS`).
3. Optional: paid order receipt (needs Stripe sandbox — [`STRIPE_SANDBOX_CHECKLIST.md`](STRIPE_SANDBOX_CHECKLIST.md)).

Worker logs must **not** be the sole delivery path with console `Content-Type: text/plain` dumps.

---

## 4. What is already wired (do not reinvent)

| Piece | Location |
|-------|----------|
| Console refuse when `DEBUG=False` | `backend/config/settings.py` (`ALLOW_CONSOLE_EMAIL`) |
| Account verification / password-reset tasks | `accounts/tasks.py` |
| Order receipt mail | `orders/tasks.py` |
| Contact form mail | `contact/tasks.py` / `contact/services.py` |
| Custom project staff alerts | `custom_projects/tasks.py` / `notifications.py` |
| After-commit enqueue | shared `enqueue_after_commit` pattern |
| Compose env pass-through | `docker-compose.yml` `web` + `worker` |

---

## 5. Sign-off

| Check | Date / initials |
|-------|-----------------|
| SMTP env on web + worker | |
| `check_email_config --fail-on-warnings` OK | |
| `--send-test-email` delivered | |
| Password-reset or contact smoke OK | |

Record production cutover in [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §2.4 / §5.
