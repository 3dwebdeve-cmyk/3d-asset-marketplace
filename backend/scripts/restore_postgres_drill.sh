#!/usr/bin/env bash
# Disposable Postgres restore drill for 3D Asset Marketplace (Phase A5).
#
# Proves a dump from backup_postgres.sh can be restored WITHOUT touching the
# Compose `postgres_data` volume. Uses an ephemeral postgres:16-alpine container
# and a throwaway Docker volume that is removed on exit.
#
# Usage (from repo root):
#   ./backend/scripts/restore_postgres_drill.sh ./backups/marketplace-YYYYMMDDTHHMMSSZ.dump
#
# Optional:
#   RESTORE_DRILL_IMAGE=postgres:16-alpine
#   RESTORE_DRILL_DB / RESTORE_DRILL_USER / RESTORE_DRILL_PASSWORD
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

if ! command -v docker >/dev/null 2>&1; then
  echo "restore_postgres_drill: docker is required" >&2
  exit 1
fi

IMAGE="${RESTORE_DRILL_IMAGE:-postgres:16-alpine}"
DB_NAME="${RESTORE_DRILL_DB:-marketplace}"
DB_USER="${RESTORE_DRILL_USER:-marketplace}"
DB_PASSWORD="${RESTORE_DRILL_PASSWORD:-drill-only-not-for-prod}"
CONTAINER="marketplace-restore-drill-$$"
VOLUME="marketplace-restore-drill-$$"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "restore_postgres_drill: dump=${DUMP_PATH}"
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
# Verify connectivity + that at least one user table exists after restore.

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
echo "restore_postgres_drill: next on staging Compose (after freeze if shared):"
echo "  docker compose exec web python manage.py migrate --noinput"
echo "  curl -fsS https://<host>/api/v1/healthz/"
echo "  smoke login + catalog browse"
echo "restore_postgres_drill: note — R2 private objects are NOT in this dump; recover objects separately."
