# Sentry Checklist

## Setup

1. Create two Sentry projects: Django (backend) and React (frontend).
2. Backend: set `SENTRY_DSN`, `SENTRY_ENVIRONMENT` (`staging` or `production`),
   `SENTRY_RELEASE` (image tag or git SHA), and optionally `SENTRY_TRACES_SAMPLE_RATE` (default 0.1).
3. Frontend: set `VITE_SENTRY_DSN` at build time and rebuild the frontend image.
   The value is baked into the bundle.
4. Create an alert rule for the tag `area: payments_webhook`, routed to a person or channel.
   Paid checkouts that fail validation raise, and Stripe retries them for about three days.

## Verify

```
docker compose exec web python manage.py check_sentry_config --fail-on-warnings
docker compose exec web python manage.py check_sentry_config --send-test-event
```

Open the test event and confirm that emails, tokens, cookies and request bodies show
as `[Filtered]` (`backend/config/sentry.py` scrubs them before sending).

## Launch watch

Watch new issues for about 24 hours after a release, with the previous image tags ready
(`ROLLBACK_REHEARSAL.md`).
