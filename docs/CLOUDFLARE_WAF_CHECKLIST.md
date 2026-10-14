# Cloudflare WAF Checklist

The app keeps its own rate limits as a second layer; Cloudflare is the first.

## In the Cloudflare dashboard

1. Proxy the public hostnames (orange cloud).
2. Turn on the managed WAF rules and Bot Fight Mode.
3. Add rate-limiting rules for `/api/v1/auth/` (login, register, password reset) and
   `/api/v1/payments/checkout/`.
4. Lock the origin so it is reachable only from Cloudflare (see `PRODUCTION_CHECKLIST.md`).

## App-side check

```
docker compose exec web python manage.py check_waf_readiness --fail-on-warnings
```

It confirms the auth throttle rates (login 5/min, register 3/min, password reset 5/hour,
token refresh 20/min, checkout 10/min), that the shared database cache backs the
throttles, that `frontend/nginx.conf` trusts `CF-Connecting-IP` only from Cloudflare
ranges and strips it before proxying, and that `SECURE_PROXY_SSL_HEADER` is set.

The dashboard settings cannot be checked from the app, so record them here.

| Date | Hostname | WAF on | Bot Fight on | Rate rules | Initials |
|------|----------|--------|--------------|------------|----------|
|      |          |        |              |            |          |
