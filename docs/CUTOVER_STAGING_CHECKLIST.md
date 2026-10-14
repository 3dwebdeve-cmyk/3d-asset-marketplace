# Cutover Checklist

The cutover gate combines the deploy, email, Stripe, R2, Sentry, auth, ops, search and
health checks for one environment profile.

```
docker compose exec web python manage.py check_cutover --profile staging --fail-on-warnings
docker compose exec web python manage.py check_cutover --profile production --fail-on-warnings --require-smtp --require-sentry
```

The `production` profile always treats email and Sentry as blocking.
`--skip-django-deploy-check` skips `check --deploy` (for local runs only).

## Host steps the gate cannot do

1. Build immutable images: `IMAGE_TAG=<date>-<sha> ./backend/scripts/build_immutable_images.sh`.
2. Release them: `WEB_IMAGE=... FRONTEND_IMAGE=... ./backend/scripts/release_compose.sh`
   (refuses `:latest`).
3. Confirm the web health check and the outbox worker are running:
   `docker compose exec web python manage.py check_background_jobs`.
4. Run a backup and a restore drill (`BACKUP_RESTORE_DRILL.md`), and install the backup cron.
5. Run a Stripe test-mode checkout on the staging hostname (`STRIPE_SANDBOX_CHECKLIST.md`).
6. Watch Sentry for about 24 hours with the previous tags ready (`ROLLBACK_REHEARSAL.md`).
7. Production only: cut DNS through Cloudflare (proxied), then confirm TLS and HSTS.

## Sign-off

| Date | Profile | Gate result | Image tags | Initials |
|------|---------|-------------|------------|----------|
|      |         |             |            |          |
