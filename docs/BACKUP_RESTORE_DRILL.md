# Backup and Restore Drill

## Backups

```
./backend/scripts/backup_postgres.sh                      # through Compose
BACKUP_VIA_COMPOSE=0 ./backend/scripts/backup_postgres.sh  # against DB_* directly
BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh   # also upload to the private R2 bucket
```

The dump is written to a `.partial` file and renamed only after `pg_dump` succeeds,
so a failed run never leaves a partial dump under the final name.

Install the daily cron on Linux hosts (default 02:15 UTC, 14-day retention):

```
./backend/scripts/install_backup_cron.sh
```

Freshness check (default: the newest dump must be younger than 2160 minutes):

```
BACKUP_MAX_AGE_MINUTES=1500 ./backend/scripts/check_backup_freshness.sh
```

## Restore drill

```
./backend/scripts/restore_postgres_drill.sh
```

`RESTORE_DRILL_MODE` is `auto` (default), `docker` (throwaway container and volume), or
`local` (a disposable `marketplace_restore_drill_<pid>` database that is dropped
afterwards). The drill never touches the live database or the Compose data volume.

Private object backups (R2 to a separate bucket):

```
R2_BACKUP_BUCKET=<separate bucket> python backend/scripts/object_backup_drill.py backup --execute
```

| Date | Dump file | Restore mode | Tables verified | Initials |
|------|-----------|--------------|-----------------|----------|
|      |           |              |                 |          |
