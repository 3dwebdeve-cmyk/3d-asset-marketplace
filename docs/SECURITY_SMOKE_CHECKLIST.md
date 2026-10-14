# Security Smoke Checklist

```
docker compose exec web python manage.py check_security_smoke --fail-on-warnings
```

The command checks, in process:

- Deploy hygiene: `DEBUG`, SSL redirect, HSTS, secure session and CSRF cookies
  (and `check --deploy` unless `--skip-django-deploy-check` is given).
- Login throttling: a repeated wrong password returns 429 with `code=throttled`.
- Downloads without a token return 401.
- Private package paths are never served from `/media/`.
- A webhook with a bad Stripe signature returns 400 and changes nothing.
- CORS and CSRF allowlists contain no wildcards.
- Django `/admin/` is disabled, allowlisted, or redirects to login.
- The OpenAPI schema is private when `DEBUG=False`.

Run it on staging with `DEBUG=False` and HTTPS, then record the result.

| Date | Host | Result | Initials |
|------|------|--------|----------|
|      |      |        |          |
