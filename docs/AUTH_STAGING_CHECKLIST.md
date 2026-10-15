# Auth Checklist

## Administrators

```
docker compose exec web python manage.py ensure_administrator --email ops@example.com --full-name "Ops Admin" --password <strong password>
docker compose exec web python manage.py check_auth_config --fail-on-warnings
```

At least one active administrator is required before cutover.

## Administrator two-factor sign-in

Every administrator signs in with a password **and** a 6-digit code from an
authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
Staging and production refuse to start with `ADMIN_MFA_REQUIRED=False`.

- **First sign-in:** after the password, the console shows a setup key. Add it to the
  authenticator app, enter the code, then save the 10 recovery codes shown once. The
  administrator is emailed that two-factor sign-in was set up.
- **Every sign-in after that:** password, then the current code. Each code works once.
  Wrong codes count toward the login lockout. Every administrator sign-in is emailed to
  that administrator.
- **Lost phone:** sign in with a recovery code (each works once), then create new codes
  under Console → Security.
- **Lost phone and codes:** after confirming who is asking (a call, not email), run on the
  server:
  ```
  docker compose exec web python manage.py reset_admin_mfa --email ops@example.com
  ```
  They are signed out everywhere and set up a new authenticator at the next sign-in.
- **Sessions:** an administrator session ends `ADMIN_SESSION_MAX_HOURS` (default 8) after
  sign-in, however often the console refreshes. Customers keep 30 days.
- **Keys:** authenticator secrets are derived from `MFA_SECRET_KEY` and never stored. Set a
  dedicated `MFA_SECRET_KEY` (at least 32 random bytes) so rotating `SECRET_KEY` does not
  reset every administrator. Changing `MFA_SECRET_KEY` itself resets everyone's
  authenticator.
- The Django admin (`/admin/`) has a password-only login, so production refuses to start
  with `DJANGO_ADMIN_ENABLED=True`. Use `/console`.
- Setup and sign-in are only reachable from `ADMIN_CONSOLE_ALLOWED_IPS`, which limits who
  could reach the setup screen with a stolen password before the real administrator.

## Passwords

New and changed passwords are checked against known data breaches (Have I Been Pwned).
Only the first five characters of the password's SHA-1 hash leave the server. If the
service is unreachable the password is accepted and a warning is logged.
`PASSWORD_BREACH_CHECK=False` turns it off (CI only).

## Email

Verification and password-reset links use `FRONTEND_BASE_URL`, which must be the public
`https://` SPA origin. Email goes through the Brevo API (`BREVO_API_KEY`) or SMTP.

```
docker compose exec web python manage.py check_email_config --fail-on-warnings
docker compose exec web python manage.py check_email_config --send-test-email you@example.com
```

Security emails customers receive:

- **Password changed** (change or reset).
- **New sign-in** from a browser not seen before for that account. A browser is
  recognised by a random httpOnly `device_id` cookie; only its hash is stored. An
  account's first browser is recorded silently.

## Behaviour to know

- Access tokens last 30 minutes. Customer refresh tokens last 30 days, are rotated and
  blacklisted on use, and are delivered only in an httpOnly cookie scoped to `/api/v1/auth/`.
- A password change or reset revokes existing tokens.
- Registering an email that already has an account returns the same response as a new
  account and sends the owner a notice, so the endpoint does not reveal registered emails.
- Login lockout: `LOGIN_LOCKOUT_MAX_FAILURES` (default 10) failures from one IP for one
  email, plus a ceiling of `LOGIN_LOCKOUT_ACCOUNT_MAX_FAILURES` (default 50) across all IPs,
  within `LOGIN_LOCKOUT_WINDOW_SECONDS` (default 900).
- Demoting an administrator also removes superuser rights.
