# Backup and Restore Drill

## How backups are protected

- **Encrypted on the server.** `pg_dump` is piped straight into `age`, so no unencrypted
  dump is ever written to disk. The server holds only the public key (`BACKUP_AGE_RECIPIENT`).
  The private key is kept offline; without it nobody, including an attacker with the
  server, can read a backup.
- **Separate bucket, separate key.** Backups go to `R2_BACKUP_BUCKET` with their own R2
  token (`R2_BACKUP_*`). The app's R2 token has no access to it, so a leaked app key does
  not expose the customer database.
- **Locked for 30 days.** A bucket lock rule stops anyone deleting a backup early, even
  with valid keys.

Staging and production refuse to back up without encryption, and an upload is never sent
unencrypted.

## One-time setup

1. Install `age` on the backup host: `apt install age`.
2. On a trusted machine (not the server), create the key pair:
   ```
   age-keygen -o marketplace-backup-key.txt
   ```
   The file holds the private key; the line `# public key: age1...` is the recipient.
   Store the key file offline in at least two places (for example a password manager and
   an encrypted USB drive). **Losing it makes every backup unreadable.**
3. On the backup host, `cp .env.backup.example .env.backup && chmod 600 .env.backup`, then set
   `BACKUP_AGE_RECIPIENT=age1...` there. Do not use `.env`: Compose loads it into the app
   containers, and the app must never hold backup secrets.
4. In Cloudflare R2, create the bucket `R2_BACKUP_BUCKET` (for example `3dam-backups`):
   - **Bucket lock rule:** retain all objects for 30 days.
   - **Lifecycle rule:** delete objects after 31 days (keeps storage cost flat).
   - Public access: off.
5. Create the backup API token (see `R2_STAGING_CHECKLIST.md`, "API tokens") and set
   `R2_BACKUP_BUCKET`, `R2_BACKUP_ACCESS_KEY_ID` and `R2_BACKUP_SECRET_ACCESS_KEY` in `.env.backup`.
   The app refuses to start on staging/production if the backup secret is in its environment.
6. Install the daily cron (02:15 UTC, 30-day local retention):
   ```
   ./backend/scripts/install_backup_cron.sh
   ```
   It refuses to install uploads until `BACKUP_AGE_RECIPIENT` is set.

## Backups

```
./backend/scripts/backup_postgres.sh                      # through Compose
BACKUP_VIA_COMPOSE=0 ./backend/scripts/backup_postgres.sh  # against DB_* directly
BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh   # also upload to the backup bucket
```

Encrypted dumps are named `marketplace-<UTC stamp>.dump.age` and uploaded to
`postgres/` in the backup bucket. The file is written under a `.partial` name and renamed
only after every step succeeds, so a failed run never leaves a dump under the final name.

Freshness check (default: the newest dump must be younger than 2160 minutes):

```
BACKUP_MAX_AGE_MINUTES=1500 ./backend/scripts/check_backup_freshness.sh
```

## Restore drill

Download a dump from the backup bucket, then run the drill with the offline key:

```
BACKUP_AGE_IDENTITY=/path/to/marketplace-backup-key.txt \
  ./backend/scripts/restore_postgres_drill.sh ./marketplace-<stamp>.dump.age
```

The dump is decrypted into a private temporary directory that is removed when the drill
ends. `RESTORE_DRILL_MODE` is `auto` (default), `docker` (throwaway container and volume),
or `local` (a disposable `marketplace_restore_drill_<pid>` database that is dropped
afterwards). The drill never touches the live database or the Compose data volume.

Do the drill on a trusted machine: the decrypted dump contains every customer record.

## In-place restore (staging only; never production without a freeze)

```
age -d -i marketplace-backup-key.txt -o restore.dump marketplace-<stamp>.dump.age
docker compose exec -T postgres pg_restore -U <DB_USER> -d <DB_NAME> --clean --if-exists < restore.dump
docker compose exec web python manage.py migrate --noinput
curl -fsS https://<host>/api/v1/healthz/
shred -u restore.dump
```

## Private object backups

Copies the private bucket (paid packages) into `snapshots/` in the backup bucket, using the
backup token:

```
python backend/scripts/object_backup_drill.py backup --execute
```

Each run copies the whole private bucket, and the lock keeps every copy for 30 days, so
storage grows with catalog size × 30. Run it less often (for example weekly, with
`BACKUP_OBJECTS=0` in the daily cron) if that cost is too high.

| Date | Dump file | Restore mode | Tables verified | Initials |
|------|-----------|--------------|-----------------|----------|
|      |           |              |                 |          |
