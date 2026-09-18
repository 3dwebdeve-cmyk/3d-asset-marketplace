# Deploy secrets / hosts / TLS staging checklist (Phase A2)

**Scope:** Replace local-safe `.env.example` placeholders with unique secrets, public hosts, CSRF origins, and TLS flags before staging/prod boot. Prove `check --deploy` is clean and data-plane ports stay private.

**Related:** `docs/PRODUCTION_CHECKLIST.md` §1 / §2.1, root `.env.example`, `backend/config/settings.py`, `python manage.py check_deploy_config`.

**Do not invent new env vars** — use only the keys already listed in PRODUCTION_CHECKLIST §1. Live host `.env` values are never committed.

---

## 1. Env on the host (never commit)

Copy root `.env.example` → `.env` on the staging/prod host. Set at minimum:

```env
DEBUG=False
SECRET_KEY=<openssl rand -base64 48>
DB_PASSWORD=<strong unique password ≥12 chars>
MEILI_MASTER_KEY=<unique ≥16 chars, not an example string>
ALLOWED_HOSTS=shop.example.com
FRONTEND_BASE_URL=https://shop.example.com
CORS_ALLOWED_ORIGINS=https://shop.example.com
PUBLIC_API_BASE_URL=https://shop.example.com
CSRF_TRUSTED_ORIGINS=https://shop.example.com
# When TLS terminates at Cloudflare / load balancer:
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
ALLOW_LOCALHOST_FRONTEND=False
ALLOW_CONSOLE_EMAIL=False
```

| Variable | Notes |
|----------|--------|
| `SECRET_KEY` | Never reuse `change-me-to-a-long-random-string-at-least-32-bytes` |
| `ALLOWED_HOSTS` | Public hostname(s) only — no `*` |
| `CSRF_TRUSTED_ORIGINS` | Required when `DEBUG=False` (https origins) |
| `SECURE_SSL_REDIRECT` | `True` behind real TLS; keep `False` only for local HTTP Compose |
| Local Compose | May keep localhost hosts + `SECURE_SSL_REDIRECT=False` for DX |

Generate a secret:

```bash
openssl rand -base64 48
```

Restart **web and worker** after changing secrets/hosts:

```bash
docker compose up -d --force-recreate web worker
```

---

## 2. Config check

```bash
# From Compose web (or backend venv with the same env):
docker compose exec web python manage.py check_deploy_config
docker compose exec web python manage.py check_deploy_config --fail-on-warnings
docker compose exec web python manage.py check_deploy_config --django-deploy-check --fail-on-warnings
```

Expect:

- `SECRET_KEY_is_example=False`
- `ALLOWED_HOSTS_local_only=False` on staging/prod
- `CSRF_TRUSTED_ORIGINS_count` ≥ 1 when `DEBUG=False`
- `SECURE_SSL_REDIRECT=True` once HTTPS is live at the edge
- Django `check --deploy` → **zero** issues (custom checks `config.E001` / `config.E002` / `config.W001` included)

Also useful:

```bash
docker compose exec web python manage.py check --deploy
```

---

## 3. TLS at the proxy

1. Terminate TLS at Cloudflare (or equivalent) in front of the Compose Nginx / SPA port.
2. Origin may speak HTTP to containers; Django trusts `X-Forwarded-Proto` when `DEBUG=False`.
3. Enable `SECURE_SSL_REDIRECT=True` and HSTS only after HTTPS works end-to-end (cookies become `Secure`).
4. Smoke: open `https://<host>/console/login` and a public product page without mixed-content / redirect loops.

---

## 4. Ports must stay private

Confirm on the host / security group / Cloudflare tunnel:

| Service | Public? |
|---------|---------|
| SPA / Nginx (`FRONTEND_PORT`, default 8080) | Yes (or via Cloudflare only) |
| Gunicorn `:8000` | **No** |
| Postgres `:5432` | **No** |
| Redis `:6379` | **No** |
| Meilisearch `:7700` | **No** |

Compose already publishes only the frontend port by default — do not add public `ports:` for postgres/redis/meilisearch/web.

---

## 5. Sign-off

| Check | Done |
|-------|------|
| Unique `SECRET_KEY` / `DB_PASSWORD` / `MEILI_MASTER_KEY` | |
| Public `ALLOWED_HOSTS` + SPA/API origins + `CSRF_TRUSTED_ORIGINS` | |
| `check_deploy_config --fail-on-warnings` OK | |
| `manage.py check --deploy` zero issues | |
| TLS at edge + `SECURE_SSL_REDIRECT` when ready | |
| Data-plane ports not public | |

Record date/initials in `docs/PRODUCTION_CHECKLIST.md` when the live host is signed off.
