# Cloudflare WAF / bot protection (Phase H3)

**Scope:** Put Cloudflare in front of Compose Nginx, enable WAF / Bot Fight (or Super Bot Fight), and keep Django/DRF throttles as a second layer — **do not disable them**.

**Related:** [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §5, [`SECURITY_SMOKE_CHECKLIST.md`](SECURITY_SMOKE_CHECKLIST.md), [`DEPLOY_SECRETS_STAGING_CHECKLIST.md`](DEPLOY_SECRETS_STAGING_CHECKLIST.md), `frontend/nginx.conf`, `python manage.py check_waf_readiness`.

**Does not replace:** enabling proxied DNS + WAF in the Cloudflare dashboard on the live hostname and recording date/initials below.

---

## 0. App-layer readiness (repo / local)

From `backend/` (venv active):

```bash
python manage.py check_waf_readiness
# Staging/prod gate:
python manage.py check_waf_readiness --fail-on-warnings
```

Compose:

```bash
docker compose exec web python manage.py check_waf_readiness --fail-on-warnings
```

| Check id | What it asserts |
|----------|-----------------|
| `auth_throttle_rates` | `auth_login` / `auth_register` (and related auth scopes) still configured |
| `auth_throttle_classes` | Login / register / Google / admin-login views still use `LoginRateThrottle` / `RegisterRateThrottle` |
| `shared_throttle_cache` | Redis cache when `DEBUG=False` (throttles shared across workers) |
| `nginx_cf_client_ip` | SPA Nginx config prefers `CF-Connecting-IP` for `X-Real-IP` / `X-Forwarded-For` (when `frontend/nginx.conf` is readable) |
| `ssl_proxy_header` | When `DEBUG=False`, `SECURE_PROXY_SSL_HEADER` trusts `X-Forwarded-Proto` (TLS at Cloudflare) |

**Local result (2026-09-19, operator Auto):** `waf_readiness OK` — app throttles + Nginx CF client-IP map ready. Cloudflare dashboard enablement remains an operator host step.

Also confirm login flood still hits app 429:

```bash
python manage.py check_security_smoke --skip-django-deploy-check
# Expect [OK] login_throttle
```

---

## 1. Put Cloudflare in front of Nginx

1. Add the public hostname as a Cloudflare DNS **A/AAAA** (or CNAME) record pointing at the origin that publishes the Compose SPA/Nginx port (`FRONTEND_PORT`, default 8080).
2. Set the record to **Proxied** (orange cloud) — traffic must terminate TLS at Cloudflare, then forward to origin.
3. Prefer locking origin so only Cloudflare can reach the SPA port (firewall / security group / Cloudflare Tunnel). Do **not** publish Postgres, Redis, Meilisearch, or Gunicorn (`:8000`) publicly — see [`DEPLOY_SECRETS_STAGING_CHECKLIST.md`](DEPLOY_SECRETS_STAGING_CHECKLIST.md) §4.
4. On the host `.env` (after HTTPS works end-to-end):

```env
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
ALLOWED_HOSTS=<public-hostname>
FRONTEND_BASE_URL=https://<public-hostname>
CORS_ALLOWED_ORIGINS=https://<public-hostname>
PUBLIC_API_BASE_URL=https://<public-hostname>
CSRF_TRUSTED_ORIGINS=https://<public-hostname>
```

5. Restart web/worker after env changes. Smoke: `https://<host>/` and `https://<host>/api/v1/healthz/` without redirect loops or mixed content.

Nginx already prefers edge `X-Forwarded-Proto` and, when present, **`CF-Connecting-IP`** for client IP so DRF anon throttles key by the real visitor, not a Cloudflare edge address.

---

## 2. Enable WAF / Bot Fight

In Cloudflare Dashboard for the zone:

1. **Security → Bots** — enable **Bot Fight Mode** (Free) or **Super Bot Fight Mode** (paid plans). Prefer “Definitely automated” → Managed Challenge / Block; avoid challenging known good bots you rely on (e.g. uptime monitors) unless allowlisted.
2. **Security → WAF** — enable **Cloudflare Managed Ruleset** and **OWASP Core Ruleset** (plan-dependent). Start in log/challenge mode if needed, then enforce.
3. **Optional custom rate-limit rule** (complementary to DRF):
   - Paths: `/api/v1/auth/login/`, `/api/v1/auth/register/`, `/api/v1/auth/admin/login/`, `/api/v1/auth/google/`
   - Action: Managed Challenge or Block on burst (e.g. >20 req/min per IP)
4. **Stripe webhook exception** — skip Bot Fight / WAF challenge for:

   `POST /api/v1/payments/webhook/`

   Stripe calls this from Stripe IPs with a signed body. Challenging it breaks fulfillment. Prefer a WAF skip / allow rule on that exact path (method POST). Signature verification in Django remains mandatory (`check_security_smoke` → `bad_webhook_signature`).

5. Do **not** disable application throttles after enabling the edge.

---

## 3. Preserve app throttles (second layer)

DRF still enforces auth and checkout limits via the shared Redis cache. Cloudflare is complementary, not a replacement.

| Scope | Default rate | Applied on |
|-------|--------------|------------|
| `auth_login` | 5/min | `/api/v1/auth/login/`, `/api/v1/auth/google/`, `/api/v1/auth/admin/login/` |
| `auth_register` | 3/min | `/api/v1/auth/register/` (+ legal accept) |
| `auth_password_reset` | 5/hour | password-reset request |
| `payment_checkout` | 10/min | checkout / quotation pay |

Verify after deploy:

```bash
docker compose exec web python manage.py check_waf_readiness --fail-on-warnings
docker compose exec web python manage.py check_security_smoke --fail-on-warnings
```

Expect wrong-password login flood → **429** `code=throttled` even if Bot Fight is off on a given path.

---

## 4. Edge smoke (staging / production)

Run through the public Cloudflare hostname (not origin IP):

- [ ] Anonymous browse (home, product detail, plugins) works
- [ ] Legitimate customer login succeeds
- [ ] `/console/login` administrator login succeeds
- [ ] Scripted login flood is challenged/blocked at Cloudflare **or** returns app **429**
- [ ] Register path is rate-limited at edge and/or app
- [ ] Stripe test webhook still delivers (`check_stripe_config --smoke-fulfill` or Dashboard resend) — no Bot Fight challenge on `/api/v1/payments/webhook/`
- [ ] Response headers show Cloudflare (`cf-ray` / similar) and HTTPS cookies (`Secure`) when `DEBUG=False`

---

## 5. Sign-off

| Check | Local (2026-09-19) | Staging | Production |
|-------|--------------------|---------|------------|
| `check_waf_readiness` | OK | | |
| Nginx `CF-Connecting-IP` → client IP | OK (`frontend/nginx.conf`) | | |
| DRF auth throttles still enabled | OK (`auth_login` 5/min, `auth_register` 3/min) | | |
| `check_security_smoke` login_throttle | OK | | |
| Cloudflare proxied (orange cloud) | N/A (no public host in this env) | | |
| Bot Fight / Super Bot Fight on | N/A | | |
| WAF managed rules on | N/A | | |
| Webhook path skip-challenge | N/A | | |
| Edge smoke (§4) | N/A | | |

Record date + initials in [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §0 / §5 when staging/prod Cloudflare is live.
