# R2 Storage Checklist

Two Cloudflare R2 buckets are required on staging and production: one **public**
(previews, thumbnails, avatars) and one **private** (paid packages). They must be different.

| Setting | Value |
|---------|-------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 API token with read and write on both buckets |
| `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET` | Bucket names |
| `R2_PUBLIC_BASE_URL` | Public CDN URL of the public bucket |
| `R2_ENDPOINT_URL` | Optional; derived from the account ID |
| `R2_SIGNED_URL_EXPIRY` | Signed link lifetime in seconds (60 to 3600, default 60). The download must start within this time; a transfer already running is not cut off |

R2 turns on only when all required values are set; otherwise the app uses local disk.

## API tokens

Use two tokens, so one leaked key cannot reach everything. Create them under
R2 → Manage R2 API Tokens, with "Apply to specific buckets only":

| Token | Permission | Buckets | Lives in |
|-------|-----------|---------|----------|
| App | Object Read & Write | public, private | the app's `.env` (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) |
| Backup | Object Read & Write | private, backup | `.env.backup` on the backup host only (`R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`) |

- The app token cannot see backups, so a leaked app key does not expose the database.
- The backup token reads the private bucket for object snapshots. It can write the backup
  bucket, but the 30-day lock rule stops it deleting backups.
- Never use an "Admin" token in either place; it can change bucket settings, including the lock.
- The backup scripts refuse to run with the app's key.

Rotate both tokens on the schedule in `KEY_ROTATION.md`.

## Checks

```
docker compose exec web python manage.py verify_r2
docker compose exec web python manage.py verify_r2 --smoke-presign
docker compose exec web python manage.py audit_published_packages --fail-on-missing
```

Move leftover local media into R2 (run the dry run first):

```
docker compose exec web python manage.py migrate_local_media_to_r2 --dry-run
docker compose exec web python manage.py migrate_local_media_to_r2
```

The private bucket must not allow public access; downloads use short-lived signed URLs.
