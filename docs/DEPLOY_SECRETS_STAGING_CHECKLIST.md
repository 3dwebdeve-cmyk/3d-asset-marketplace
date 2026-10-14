# Deploy Secrets Checklist (staging and production)

Store secrets in the host's secret manager or a protected `.env` on the server. Never commit them.

| Setting | Requirement |
|---------|-------------|
| `SECRET_KEY` | Unique, at least 32 bytes (`openssl rand -base64 48`). Never the `.env.example` value |
| `DEBUG` | `False` (settings refuse `True` on staging and production) |
| `DEPLOYMENT_PROFILE` | `staging` or `production` |
| `ALLOWED_HOSTS` | Exact public hostnames. No `*` |
| `CSRF_TRUSTED_ORIGINS` | `https://` origins of the SPA and API |
| `CORS_ALLOWED_ORIGINS` | The public SPA origin(s) |
| `FRONTEND_BASE_URL` | The public `https://` SPA origin (used in email links) |
| `PUBLIC_API_BASE_URL` | The public `https://` API origin |
| `DB_PASSWORD` | Strong, at least 12 characters, not an example value |
| `DB_RUNTIME_USER` / `DB_MIGRATION_USER` | Different roles; the runtime role cannot change schema |
| `ADMIN_CONSOLE_ALLOWED_IPS` | Office or VPN egress IPs (required on staging and production) |
| `DJANGO_ADMIN_ENABLED` / `DJANGO_ADMIN_ALLOWED_IPS` | Disable, or restrict to the same IPs |
| `JWT_REFRESH_COOKIE_SECURE` | Leave unset or `True` (settings refuse `False`) |
| `ALLOW_LOCALHOST_FRONTEND`, `ALLOW_CONSOLE_EMAIL` | `False` |

## Checks

```
docker compose exec web python manage.py check_deploy_config --fail-on-warnings --django-deploy-check
docker compose exec web python manage.py check_db_runtime_role
docker compose exec web python manage.py check_auth_config --fail-on-warnings
```

See also `STRIPE_SANDBOX_CHECKLIST.md`, `SENTRY_STAGING_CHECKLIST.md` and
`R2_STAGING_CHECKLIST.md` for their secrets.
