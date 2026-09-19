#!/usr/bin/env bash
# Disposable Postgres restore drill for 3D Asset Marketplace (Phase A5).
#
# Proves a dump from backup_postgres.sh can be restored WITHOUT touching the
# live app database or Compose `postgres_data` volume.
#
# Modes (RESTORE_DRILL_MODE):
#   auto   — docker if daemon works, else local disposable DB (default)
#   docker — ephemeral postgres:16-alpine + throwaway Docker volume
#   local  — CREATE DATABASE marketplace_restore_drill_<pid> on reachable Postgres,
#            pg_restore into it, verify public tables, DROP DATABASE (never the app DB)
#
# Usage (from repo root):
#   ./backend/scripts/restore_postgres_drill.sh ./backups/marketplace-YYYYMMDDTHHMMSSZ.dump
#   RESTORE_DRILL_MODE=local ./backend/scripts/restore_postgres_drill.sh ./backups/….dump
#
# Optional (docker mode):
#   RESTORE_DRILL_IMAGE=postgres:16-alpine
#   RESTORE_DRILL_DB / RESTORE_DRILL_USER / RESTORE_DRILL_PASSWORD
#
# Optional (local mode — reuses DB_* from .env / backend/.env):
#   DB_HOST DB_PORT DB_USER DB_PASSWORD  (admin connection for CREATE/DROP DATABASE)
#   RESTORE_DRILL_OWNER  role that owns the disposable DB (default: DB_USER)
#
# In-place restore against Compose `postgres` is intentionally NOT this script.
# See docs/BACKUP_RESTORE_DRILL.md / PRODUCTION_CHECKLIST §2.6 for staging steps.
#
# R2 object recovery is separate from Postgres — this script only validates dumps.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <dump-file>" >&2
  exit 2
fi

DUMP_PATH="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
if [[ ! -f "$DUMP_PATH" ]]; then
  echo "restore_postgres_drill: missing dump file: $DUMP_PATH" >&2
  exit 1
fi

load_dotenv() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    return 0
  fi
  set -a
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

docker_usable() {
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1
}

MODE="${RESTORE_DRILL_MODE:-auto}"
if [[ "$MODE" == "auto" ]]; then
  if docker_usable; then
    MODE=docker
  else
    MODE=local
    echo "restore_postgres_drill: docker unavailable — using local disposable database mode"
  fi
fi

print_next_steps() {
  echo "restore_postgres_drill: next on staging Compose (after freeze if shared):"
  echo "  docker compose exec web python manage.py migrate --noinput"
  echo "  curl -fsS https://<host>/api/v1/healthz/"
  echo "  smoke login + catalog browse"
  echo "restore_postgres_drill: note — R2 private objects are NOT in this dump; recover objects separately."
}

run_docker_drill() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "restore_postgres_drill: docker is required for RESTORE_DRILL_MODE=docker" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "restore_postgres_drill: docker daemon is not usable; try RESTORE_DRILL_MODE=local" >&2
    exit 1
  fi

  local IMAGE="${RESTORE_DRILL_IMAGE:-postgres:16-alpine}"
  local DB_NAME="${RESTORE_DRILL_DB:-marketplace}"
  local DB_USER="${RESTORE_DRILL_USER:-marketplace}"
  local DB_PASSWORD="${RESTORE_DRILL_PASSWORD:-drill-only-not-for-prod}"
  local CONTAINER="marketplace-restore-drill-$$"
  local VOLUME="marketplace-restore-drill-$$"

  cleanup_docker() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
  }
  trap cleanup_docker EXIT

  echo "restore_postgres_drill: mode=docker dump=${DUMP_PATH}"
  echo "restore_postgres_drill: starting disposable ${IMAGE} (volume=${VOLUME})"

  docker volume create "$VOLUME" >/dev/null

  docker run -d \
    --name "$CONTAINER" \
    -e "POSTGRES_DB=${DB_NAME}" \
    -e "POSTGRES_USER=${DB_USER}" \
    -e "POSTGRES_PASSWORD=${DB_PASSWORD}" \
    -v "${VOLUME}:/var/lib/postgresql/data" \
    -v "${DUMP_PATH}:/restore/dump.dump:ro" \
    "$IMAGE" >/dev/null

  echo "restore_postgres_drill: waiting for pg_isready"
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    echo "restore_postgres_drill: postgres did not become ready" >&2
    exit 1
  fi

  echo "restore_postgres_drill: pg_restore --clean --if-exists"
  docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" \
    pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists /restore/dump.dump \
    || true
  # pg_restore may exit non-zero for benign role/extension notices on a fresh cluster.

  local TABLE_COUNT
  TABLE_COUNT="$(
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" \
      psql -U "$DB_USER" -d "$DB_NAME" -Atc \
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
  )"

  if [[ -z "$TABLE_COUNT" || "$TABLE_COUNT" -lt 1 ]]; then
    echo "restore_postgres_drill: FAIL — no public tables after restore (count=${TABLE_COUNT:-empty})" >&2
    exit 1
  fi

  echo "restore_postgres_drill: ok public_tables=${TABLE_COUNT}"
  print_next_steps
}

run_local_drill() {
  if ! command -v psql >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
    echo "restore_postgres_drill: psql and pg_restore are required for RESTORE_DRILL_MODE=local" >&2
    exit 1
  fi

  local APP_DB="${DB_NAME:-marketplace}"
  # Script-scoped so EXIT trap can see values under `set -u` after function return.
  RESTORE_DRILL_CONN_USER="${DB_USER:-marketplace}"
  RESTORE_DRILL_CONN_HOST="${DB_HOST:-localhost}"
  RESTORE_DRILL_CONN_PORT="${DB_PORT:-5432}"
  local OWNER="${RESTORE_DRILL_OWNER:-$RESTORE_DRILL_CONN_USER}"
  RESTORE_DRILL_LOCAL_DB="marketplace_restore_drill_$$"

  if [[ "$RESTORE_DRILL_LOCAL_DB" == "$APP_DB" ]]; then
    echo "restore_postgres_drill: refusing to use app DB_NAME as drill target" >&2
    exit 1
  fi
  if [[ "$RESTORE_DRILL_LOCAL_DB" != marketplace_restore_drill_* ]]; then
    echo "restore_postgres_drill: refuse unexpected drill database name" >&2
    exit 1
  fi

  export PGPASSWORD="${DB_PASSWORD:-}"

  cleanup_local() {
    local drill_db="${RESTORE_DRILL_LOCAL_DB:-}"
    local conn_host="${RESTORE_DRILL_CONN_HOST:-localhost}"
    local conn_port="${RESTORE_DRILL_CONN_PORT:-5432}"
    local conn_user="${RESTORE_DRILL_CONN_USER:-marketplace}"
    [[ -z "$drill_db" || "$drill_db" != marketplace_restore_drill_* ]] && return 0
    psql -h "$conn_host" -p "$conn_port" -U "$conn_user" -d postgres -v ON_ERROR_STOP=1 \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${drill_db}' AND pid <> pg_backend_pid();" \
      >/dev/null 2>&1 || true
    psql -h "$conn_host" -p "$conn_port" -U "$conn_user" -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"${drill_db}\";" >/dev/null 2>&1 || true
    RESTORE_DRILL_LOCAL_DB=""
  }
  trap cleanup_local EXIT

  echo "restore_postgres_drill: mode=local dump=${DUMP_PATH}"
  echo "restore_postgres_drill: creating disposable database ${RESTORE_DRILL_LOCAL_DB} on ${RESTORE_DRILL_CONN_HOST}:${RESTORE_DRILL_CONN_PORT} (app DB ${APP_DB} untouched)"

  psql -h "$RESTORE_DRILL_CONN_HOST" -p "$RESTORE_DRILL_CONN_PORT" -U "$RESTORE_DRILL_CONN_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"${RESTORE_DRILL_LOCAL_DB}\" OWNER \"${OWNER}\";"

  echo "restore_postgres_drill: pg_restore --clean --if-exists into ${RESTORE_DRILL_LOCAL_DB}"
  pg_restore -h "$RESTORE_DRILL_CONN_HOST" -p "$RESTORE_DRILL_CONN_PORT" -U "$RESTORE_DRILL_CONN_USER" -d "$RESTORE_DRILL_LOCAL_DB" \
    --clean --if-exists "$DUMP_PATH" \
    || true

  local TABLE_COUNT
  TABLE_COUNT="$(
    psql -h "$RESTORE_DRILL_CONN_HOST" -p "$RESTORE_DRILL_CONN_PORT" -U "$RESTORE_DRILL_CONN_USER" -d "$RESTORE_DRILL_LOCAL_DB" -Atc \
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
  )"

  if [[ -z "$TABLE_COUNT" || "$TABLE_COUNT" -lt 1 ]]; then
    echo "restore_postgres_drill: FAIL — no public tables after restore (count=${TABLE_COUNT:-empty})" >&2
    exit 1
  fi

  echo "restore_postgres_drill: ok public_tables=${TABLE_COUNT} drill_db=${RESTORE_DRILL_LOCAL_DB}"
  print_next_steps
}

case "$MODE" in
  docker) run_docker_drill ;;
  local) run_local_drill ;;
  *)
    echo "restore_postgres_drill: RESTORE_DRILL_MODE must be auto|docker|local (got: ${MODE})" >&2
    exit 2
    ;;
esac
