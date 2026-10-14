# Auth Checklist

## Administrators

```
docker compose exec web python manage.py ensure_administrator --email ops@example.com --full-name "Ops Admin" --password <strong password>
docker compose exec web python manage.py check_auth_config --fail-on-warnings
```

At least one active administrator is required before cutover.

## Email

Verification and password-reset links use `FRONTEND_BASE_URL`, which must be the public
`https://` SPA origin. Email goes through the Brevo API (`BREVO_API_KEY`) or SMTP.

```
docker compose exec web python manage.py check_email_config --fail-on-warnings
docker compose exec web python manage.py check_email_config --send-test-email you@example.com
```

## Behaviour to know

- Access tokens last 30 minutes. Refresh tokens last 30 days, are rotated and blacklisted
  on use, and are delivered only in an httpOnly cookie scoped to `/api/v1/auth/`.
- A password change or reset revokes existing tokens.
- Registering an email that already has an account returns the same response as a new
  account and sends the owner a notice, so the endpoint does not reveal registered emails.
- Login lockout: `LOGIN_LOCKOUT_MAX_FAILURES` (default 10) failures from one IP for one
  email, plus a ceiling of `LOGIN_LOCKOUT_ACCOUNT_MAX_FAILURES` (default 50) across all IPs,
  within `LOGIN_LOCKOUT_WINDOW_SECONDS` (default 900).
- Demoting an administrator also removes superuser rights.
