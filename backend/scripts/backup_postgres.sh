#!/usr/bin/env bash
# PostgreSQL logical backup for 3D Asset Marketplace (Feature 13 / Backend 10/10 Phase J).
#
# Prefer running from the repo root with Compose up:
#   ./backend/scripts/backup_postgres.sh
#
# Or against a reachable Postgres (DB_* from env / .env):
#   BACKUP_VIA_COMPOSE=0 ./backend/scripts/backup_postgres.sh
#
# Optional: upload the dump to the private R2 bucket (same R2_* env as the app):
#   BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh
#
# Optional: prune local dumps older than N days (marketplace-*.dump only):
#   BACKUP_RETENTION_DAYS=14 ./backend/scripts/backup_postgres.sh
#
# Cron (example — daily 02:15 UTC on the staging/prod host):
#   15 2 * * * cd /opt/3d-asset-marketplace && BACKUP_RETENTION_DAYS=14 BACKUP_UPLOAD_R2=1 ./backend/scripts/backup_postgres.sh >> /var/log/marketplace-backup.log 2>&1
#
# Env:
#   BACKUP_DIR             Local directory for dumps (default: ./backups)
#   BACKUP_VIA_COMPOSE     1 = docker compose exec postgres (default: 1 if compose works)
#   BACKUP_UPLOAD_R2       1 = upload via backend/scripts/upload_backup_to_r2.py
#   BACKUP_RETENTION_DAYS  If set (>0), delete local marketplace-*.dump older than N days
#   COMPOSE_FILE           Compose files (default: docker-compose.yml)
#   DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT  used when not via Compose

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="marketplace-${STAMP}.dump"
DUMP_PATH="${BACKUP_DIR}/${DUMP_NAME}"

mkdir -p "$BACKUP_DIR"

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

DB_NAME="${DB_NAME:-marketplace}"
DB_USER="${DB_USER:-marketplace}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

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

echo "backup_postgres: writing ${DUMP_PATH}"

# Write to a temporary name and rename only after pg_dump succeeds, so a failed
# dump never leaves a partial file under the name the freshness check trusts.
PARTIAL_PATH="${DUMP_PATH}.partial"
trap 'rm -f "$PARTIAL_PATH"' EXIT

if [[ "$via_compose" == "1" ]]; then
  docker compose -f "$COMPOSE_FILE" exec -T postgres \n    pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \n    > "$PARTIAL_PATH"
else
  export PGPASSWORD="${DB_PASSWORD:-}"
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc \n    > "$PARTIAL_PATH"
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

# Local retention only — R2 object lifecycle is configured separately in Cloudflare.
retention_days="${BACKUP_RETENTION_DAYS:-}"
if [[ -n "$retention_days" ]]; then
  if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
    echo "backup_postgres: BACKUP_RETENTION_DAYS must be a positive integer" >&2
    exit 1
  fi
  echo "backup_postgres: pruning local marketplace-*.dump older than ${retention_days} day(s) in ${BACKUP_DIR}"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'marketplace-*.dump' -mtime "+${retention_days}" -print -delete
fi

echo "backup_postgres: restore drill (disposable volume preferred):"
echo "  ./backend/scripts/restore_postgres_drill.sh ${DUMP_PATH}"
echo "backup_postgres: in-place restore (staging only — never prod without freeze):"
echo "  docker compose exec -T postgres pg_restore -U ${DB_USER} -d ${DB_NAME} --clean --if-exists < ${DUMP_PATH}"
echo "  docker compose exec web python manage.py migrate --noinput"
echo "  curl -fsS https://<host>/api/v1/healthz/"
