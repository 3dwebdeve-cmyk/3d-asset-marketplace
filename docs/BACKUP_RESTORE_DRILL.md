# Backup + restore drill checklist (Phase A5)

**Scope:** Run the existing Postgres logical backup, prove restore on a disposable volume, schedule daily dumps with retention, and confirm R2 object recovery is separate from the database dump.

**Related:** [`backend/scripts/backup_postgres.sh`](../backend/scripts/backup_postgres.sh), [`backend/scripts/restore_postgres_drill.sh`](../backend/scripts/restore_postgres_drill.sh), [`backend/scripts/upload_backup_to_r2.py`](../backend/scripts/upload_backup_to_r2.py), [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §2.6.

**Do not rewrite** the backup/upload helpers — extend env flags and operator runbooks only. Live staging/prod sign-off is operator work (this repo cannot complete it alone).

---

## 1. Create a logical dump

From the repo root with Compose Postgres healthy (or `BACKUP_VIA_COMPOSE=0` + reachable `DB_*`):

```bash
chmod +x backend/scripts/backup_postgres.sh backend/scripts/restore_postgres_drill.sh
./backend/scripts/backup_postgres.sh

# Optional: copy dump to private R2 (same R2_* env as the app):
BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh
```

Dumps land in `./backups/` (gitignored) as `marketplace-<UTC>.dump` (`pg_dump -Fc`). Record the byte size from the script log.

R2 object key prefix: `backups/postgres/<filename>` in `R2_PRIVATE_BUCKET`.

---

## 2. Disposable restore drill (preferred — safe by default)

Proves the dump restores **without** touching Compose volume `postgres_data` or the live app database:

```bash
./backend/scripts/restore_postgres_drill.sh ./backups/marketplace-YYYYMMDDTHHMMSSZ.dump

# Force mode when needed:
RESTORE_DRILL_MODE=docker ./backend/scripts/restore_postgres_drill.sh ./backups/….dump
RESTORE_DRILL_MODE=local  ./backend/scripts/restore_postgres_drill.sh ./backups/….dump
```

| Mode | When | What it does |
|------|------|----------------|
| `auto` (default) | Prefer Docker | Uses `docker` if the daemon works, else `local` |
| `docker` | Compose/Docker hosts | Ephemeral `postgres:16-alpine` + throwaway volume, then cleanup |
| `local` | Dev hosts / Docker down | `CREATE DATABASE marketplace_restore_drill_<pid>` on reachable Postgres → `pg_restore` → verify → `DROP DATABASE` (app `DB_NAME` never targeted) |

Expect: `public_tables >= 1`, then automatic cleanup of the disposable container/volume or drill database.

### Staging Compose follow-up (after disposable drill OK)

On a **staging or disposable** Compose stack (never overwrite prod without a maintenance freeze):

```bash
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  < backups/marketplace-YYYYMMDDTHHMMSSZ.dump
docker compose exec web python manage.py migrate --noinput
curl -fsS https://<staging-host>/api/v1/healthz/
# Smoke: login + catalog browse
```

---

## 3. Cron schedule + retention

**Install on the Linux staging/prod host (idempotent):**

```bash
chmod +x backend/scripts/install_backup_cron.sh
./backend/scripts/install_backup_cron.sh
# Preview only:
INSTALL_BACKUP_CRON_DRY_RUN=1 ./backend/scripts/install_backup_cron.sh
```

**Equivalent crontab line (daily 02:15 UTC):**

```cron
15 2 * * * cd /opt/3d-asset-marketplace && BACKUP_RETENTION_DAYS=14 BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh >> /var/log/marketplace-backup.log 2>&1
```

| Policy | Default recommendation | Notes |
|--------|------------------------|--------|
| Local dumps | `BACKUP_RETENTION_DAYS=14` | Script deletes only `marketplace-*.dump` older than N days under `BACKUP_DIR` |
| R2 copies | Lifecycle rule 30–90 days on prefix `backups/postgres/` | Configure in Cloudflare R2 — **not** done by the shell / cron installer |
| Frequency | Daily | Increase before risky deploys / migrations |

Unset `BACKUP_RETENTION_DAYS` means **no** local prune (operator must manage disk). Windows hosts: use Task Scheduler to run the same script under Git Bash — `install_backup_cron.sh` requires Linux `crontab`.

---

## 4. R2 object recovery ≠ Postgres restore

| Data | Recovery path |
|------|----------------|
| Orders, users, entitlements, catalog metadata | Postgres dump → `restore_postgres_drill.sh` / staging `pg_restore` |
| Private packages, custom-project files, uploaded dumps | Cloudflare R2 (private bucket) versioning / object restore / account recovery |
| Public media | Public R2 bucket (separate from DB) |

Restoring Postgres alone does **not** bring back missing R2 objects. Confirm versioning or lifecycle restore for `R2_PRIVATE_BUCKET` / `R2_PUBLIC_BUCKET` before calling the drill complete.

---

## 5. What is already wired (do not reinvent)

| Piece | Location |
|-------|----------|
| `pg_dump -Fc` Compose or direct | `backend/scripts/backup_postgres.sh` |
| Optional R2 upload (boto3 + same `R2_*`) | `backend/scripts/upload_backup_to_r2.py` |
| Disposable restore drill (docker or local DB) | `backend/scripts/restore_postgres_drill.sh` |
| Host cron installer (Linux) | `backend/scripts/install_backup_cron.sh` |
| Upload helper unit tests (no network) | `backend/config/test_backup_scripts.py` |
| Dump directory ignored by git | `backups/` in `.gitignore` |

---

## 6. Sign-off

| Check | Date / initials |
|-------|-----------------|
| Logical dump created; size recorded | 2026-09-19 / AUTO (local Postgres `BACKUP_VIA_COMPOSE=0`, retention=14) |
| Optional R2 upload verified (`backups/postgres/…`) | _(skip until R2_* on host — optional)_ |
| Disposable restore drill OK (`restore_postgres_drill.sh`) | 2026-09-19 / AUTO (`RESTORE_DRILL_MODE=local`; Docker daemon unavailable) |
| Staging: migrate + healthz + smoke login/browse | |
| Host cron installed; retention (`BACKUP_RETENTION_DAYS` + R2 lifecycle) documented | Installer shipped — run `install_backup_cron.sh` on Linux host; dry-run verified 2026-09-19 / AUTO |
| R2 object recovery understood as separate from Postgres | 2026-09-19 / AUTO (confirmed in runbook §4; files not in DB dump) |

Record production cutover in [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) §2.6 / §5.
