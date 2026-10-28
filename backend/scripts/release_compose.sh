#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# A docker-compose.override.yml holds local development values. Plain `docker compose`
# loads it automatically, so refuse unless COMPOSE_FILE names the files explicitly.
if [[ -f docker-compose.override.yml && -z "${COMPOSE_FILE:-}" ]]; then
  echo "docker-compose.override.yml is present: set COMPOSE_FILE (e.g. docker-compose.yml:docker-compose.prod.yml) or remove it." >&2
  exit 1
fi

if [[ -z "${WEB_IMAGE:-}" || -z "${FRONTEND_IMAGE:-}" ]]; then
  echo "Set immutable WEB_IMAGE and FRONTEND_IMAGE before release." >&2
  exit 1
fi
if [[ "$WEB_IMAGE" == *:latest || "$FRONTEND_IMAGE" == *:latest ]]; then
  echo "Refusing mutable :latest image tags." >&2
  exit 1
fi

docker compose config --quiet
docker compose up -d --wait --wait-timeout 120 postgres
docker compose run --rm --no-deps migrate
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 web worker frontend

BASE_URL="${RELEASE_BASE_URL:-http://localhost:${FRONTEND_PORT:-8080}}"
curl --fail --silent --show-error "${BASE_URL%/}/api/v1/healthz/" >/dev/null
curl --fail --silent --show-error "${BASE_URL%/}/" >/dev/null
docker compose exec -T worker python manage.py check_background_jobs
docker compose exec -T web python manage.py check_payment_reconciliation
docker compose exec -T web python manage.py audit_published_packages --fail-on-missing
docker compose exec -T web python manage.py check_capacity
./backend/scripts/check_backup_freshness.sh
docker compose ps web worker frontend
echo "Release services ready; run host-specific staging integration checks."
