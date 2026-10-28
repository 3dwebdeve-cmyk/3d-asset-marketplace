# Rollback Rehearsal

Rollback swaps the application images back to the previous tags. It does **not** reverse
migrations or touch Postgres.

## Before deploying a new release

1. Record the known-good tags currently running (`WEB_IMAGE`, `FRONTEND_IMAGE`).
   Never use `:latest`; the release and rollback scripts refuse it.
2. Take a database backup: `./backend/scripts/backup_postgres.sh`.
3. Keep the previous `.env` or secret-manager version for that release.

## Roll back

```
export WEB_IMAGE=<previous web tag>
export FRONTEND_IMAGE=<previous frontend tag>
./backend/scripts/rollback_compose.sh
```

Or pass `PREVIOUS_WEB_IMAGE` and `PREVIOUS_FRONTEND_IMAGE` explicitly. Windows hosts can use
`rollback_compose.ps1`.

## Verify after rollback

```
docker compose exec web python manage.py check_rollback_rehearsal --profile staging --fail-on-warnings
docker compose exec web python manage.py check_rollback_rehearsal --profile staging --smoke-webhook
```

The check confirms immutable tags, `/api/v1/healthz/`, a mocked checkout, and that a
replayed Stripe webhook does not grant a second entitlement. `--smoke-webhook` also runs
a real Stripe **test-mode** checkout and replay.

## Destructive migrations

If the release you are leaving ran a destructive migration (dropped a column or table),
an image rollback is not enough. Restore the pre-deploy dump instead
(see `BACKUP_RESTORE_DRILL.md`). Prefer expand-then-contract migrations so rollback stays safe.

## Sign-off

| Date | Release rolled back | Previous tags | Checks passed | Initials |
|------|---------------------|---------------|---------------|----------|
|      |                     |               |               |          |
