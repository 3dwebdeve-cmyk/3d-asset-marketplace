#!/usr/bin/env bash
# PostgreSQL logical backup for 3D Asset Marketplace (Feature 13 / Backend 10/10 Phase J).
#
# Prefer running from the repo root with Compose up:
#   ./backend/scripts/backup_postgres.sh
#
# Or against a reachable Postgres (DB_* from env / .env):
#   BACKUP_VIA_COMPOSE=0 ./backend/scripts/backup_postgres.sh
#
# Encryption (required on staging/production and for any upload):
#   BACKUP_AGE_RECIPIENT=age1... ./backend/scripts/backup_postgres.sh
# pg_dump is piped straight into `age`, so no unencrypted dump touches the disk.
# Only the public key lives on the server; keep the private key offline.
#
# Optional: upload the encrypted dump to the separate backup bucket:
#   BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh
#
# Optional: prune local dumps older than N days:
#   BACKUP_RETENTION_DAYS=30 ./backend/scripts/backup_postgres.sh
#
# Cron (example — daily 02:15 UTC on the staging/prod host):
#   15 2 * * * cd /opt/3d-asset-marketplace && BACKUP_RETENTION_DAYS=30 BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh >> /var/log/marketplace-backup.log 2>&1
#
# Env:
#   BACKUP_DIR                 Local directory for dumps (default: ./backups)
#   BACKUP_VIA_COMPOSE         1 = docker compose exec postgres (default: 1 if compose works)
#   BACKUP_AGE_RECIPIENT       age public key (age1...) to encrypt to
#   BACKUP_REQUIRE_ENCRYPTION  1 = refuse without a recipient (default: 1 on staging/production)
#   BACKUP_UPLOAD_R2           1 = upload via backend/scripts/upload_backup_to_r2.py
#   BACKUP_RETENTION_DAYS      If set (>0), delete local dumps older than N days
#   COMPOSE_FILE               Compose files (default: docker-compose.yml)
#   DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT  used when not via Compose

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

load_dotenv() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    return 0
  fi
  # shellcheck disable=SC1090
  set -a
  # Export simple KEY=VALUE lines (skip comments / blanks).
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Strip CR so Windows-edited .env files do not poison values (e.g. host$'\r').
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      export "$line"
    fi
  done < "$env_file"
  set +a
}

load_dotenv "$ROOT_DIR/.env"
load_dotenv "$ROOT_DIR/backend/.env"
# Backup-only secrets (BACKUP_AGE_RECIPIENT, R2_BACKUP_*). Compose loads .env into the
# app containers, so these live in a separate file the app never sees.
load_dotenv "$ROOT_DIR/.env.backup"

DB_NAME="${DB_NAME:-marketplace}"
DB_USER="${DB_USER:-marketplace}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

case "${DEPLOYMENT_PROFILE:-development}" in
  production|staging) default_require=1 ;;
  *) default_require=0 ;;
esac
require_encryption="${BACKUP_REQUIRE_ENCRYPTION:-$default_require}"
# An upload always leaves the host, so it is never sent unencrypted.
if [[ "${BACKUP_UPLOAD_R2:-0}" == "1" ]]; then
  require_encryption=1
fi

if [[ -n "$RECIPIENT" ]]; then
  if [[ ! "$RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]]; then
    echo "backup_postgres: BACKUP_AGE_RECIPIENT is not an age public key (age1...)" >&2
    exit 1
  fi
  if ! command -v age >/dev/null 2>&1; then
    echo "backup_postgres: 'age' is not installed (apt install age)" >&2
    exit 1
  fi
  DUMP_NAME="marketplace-${STAMP}.dump.age"
elif [[ "$require_encryption" == "1" ]]; then
  echo "backup_postgres: refusing an unencrypted backup; set BACKUP_AGE_RECIPIENT" >&2
  exit 1
else
  DUMP_NAME="marketplace-${STAMP}.dump"
fi
DUMP_PATH="${BACKUP_DIR}/${DUMP_NAME}"

mkdir -p "$BACKUP_DIR"
# Dumps hold every customer record; keep them unreadable to other local users.
umask 077

compose_available() {
  command -v docker >/dev/null 2>&1 || return 1
  docker compose -f "$COMPOSE_FILE" ps postgres --status running >/dev/null 2>&1
}

via_compose="${BACKUP_VIA_COMPOSE:-}"
if [[ -z "$via_compose" ]]; then
  if compose_available; then
    via_compose=1
  else
    via_compose=0
  fi
fi

run_pg_dump() {
  if [[ "$via_compose" == "1" ]]; then
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc
  else
    PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
      -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc
  fi
}

echo "backup_postgres: writing ${DUMP_PATH}"

# Write to a temporary name and rename only after every step succeeds, so a failed
# dump never leaves a partial file under the name the freshness check trusts.
PARTIAL_PATH="${DUMP_PATH}.partial"
trap 'rm -f "$PARTIAL_PATH"' EXIT

if [[ -n "$RECIPIENT" ]]; then
  # pipefail makes a pg_dump failure fail the pipeline even though age succeeds.
  run_pg_dump | age -r "$RECIPIENT" -o "$PARTIAL_PATH"
else
  run_pg_dump > "$PARTIAL_PATH"
fi

mv -f "$PARTIAL_PATH" "$DUMP_PATH"
SIZE="$(wc -c < "$DUMP_PATH" | tr -d ' ')"
echo "backup_postgres: ok bytes=${SIZE} file=${DUMP_PATH}"

if [[ "${BACKUP_UPLOAD_R2:-0}" == "1" ]]; then
  python3 "$ROOT_DIR/backend/scripts/upload_backup_to_r2.py" "$DUMP_PATH"
fi
if [[ "${BACKUP_OBJECTS:-0}" == "1" ]]; then
  python3 "$ROOT_DIR/backend/scripts/object_backup_drill.py" backup --execute
fi

# Local retention only — the backup bucket's lock rule and lifecycle are set in Cloudflare.
retention_days="${BACKUP_RETENTION_DAYS:-}"
if [[ -n "$retention_days" ]]; then
  if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
    echo "backup_postgres: BACKUP_RETENTION_DAYS must be a positive integer" >&2
    exit 1
  fi
  echo "backup_postgres: pruning local marketplace-*.dump(.age) older than ${retention_days} day(s) in ${BACKUP_DIR}"
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'marketplace-*.dump' -o -name 'marketplace-*.dump.age' \) \
    -mtime "+${retention_days}" -print -delete
fi

echo "backup_postgres: restore drill (disposable volume preferred):"
echo "  BACKUP_AGE_IDENTITY=/path/to/offline-key.txt ./backend/scripts/restore_postgres_drill.sh ${DUMP_PATH}"
echo "backup_postgres: in-place restore (staging only — never prod without freeze): see docs/BACKUP_RESTORE_DRILL.md"
