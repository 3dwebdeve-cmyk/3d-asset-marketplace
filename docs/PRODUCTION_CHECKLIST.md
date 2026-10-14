# Production Checklist

Operator steps that code cannot enforce. Run
`docker compose exec web python manage.py check_waf_readiness` after each deploy.

## Origin reachable only through Cloudflare

Nginx trusts `CF-Connecting-IP` only when the TCP peer is a Cloudflare range
(`set_real_ip_from` in `frontend/nginx.conf`). If attackers can reach the origin
directly they are rate-limited by their own IP (safe), but they also bypass
Cloudflare WAF / Bot Fight entirely. Lock the origin down:

- Host firewall / cloud security group: allow inbound 80, 443 and the published
  `FRONTEND_PORT` (default 8080) **only** from https://www.cloudflare.com/ips/
  (IPv4 and IPv6). Deny everything else.
- Or use Cloudflare Tunnel (no inbound ports) or Authenticated Origin Pulls (mTLS).
- Never publish ports for `web` (Gunicorn) or `postgres` in `docker-compose.yml`.
  Django reads the client IP from the `X-Real-IP` header Nginx sets; a directly
  reachable Gunicorn would let clients forge it.
- When Cloudflare changes its ranges, update both the firewall and the
  `set_real_ip_from` list in `frontend/nginx.conf`.

## Compose files

- Run with `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`.
- Never create `docker-compose.override.yml` on a server; it holds local
  development values (see `LOCAL_DEVELOPMENT.md`). The release and rollback
  scripts refuse to run when one is present and `COMPOSE_FILE` is unset.
- The base file alone is secure by default, so a forgotten overlay fails closed.

## Admin allowlists

- Set `ADMIN_CONSOLE_ALLOWED_IPS` (SPA console APIs) and
  `DJANGO_ADMIN_ALLOWED_IPS` (or `DJANGO_ADMIN_ENABLED=False`) to the exact office
  or VPN egress IPs, e.g. `203.0.113.50/32`.
- Do not use broad private ranges such as `10.0.0.0/8` or `192.168.0.0/16`:
  behind Cloudflare every real visitor has a public IP, so a private range
  only widens what an allowlist bug or misconfiguration would expose.

## Rate limiting

- Throttle counters, login lockouts and idempotency keys live in the Postgres
  `marketplace_cache` table (`DatabaseCache`), shared by all Gunicorn workers.
  `entrypoint.sh` runs `createcachetable`; if you set `SKIP_STARTUP_MIGRATE`,
  run `python manage.py createcachetable` yourself before starting Gunicorn.
- Keep `CACHE_MAX_ENTRIES` high (default 100000). A small cache culls entries,
  which resets throttle counters.
- Login lockout: `LOGIN_LOCKOUT_MAX_FAILURES` (default 10) failed logins for one
  email from one IP, plus a ceiling of `LOGIN_LOCKOUT_ACCOUNT_MAX_FAILURES`
  (default 50) for that email across all IPs, within
  `LOGIN_LOCKOUT_WINDOW_SECONDS` (default 900).
- Edge limits (`limit_req` in `frontend/nginx.conf`) sit in front of the DRF
  throttles: 10 requests/min per IP (burst 20) on credential and email-sending
  auth endpoints and Django admin login, and 20 requests/s per IP (burst 40) on
  the rest of the API.
