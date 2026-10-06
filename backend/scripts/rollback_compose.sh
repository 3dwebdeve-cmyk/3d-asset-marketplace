#!/usr/bin/env bash
# Phase K2 — recreate web/worker/frontend on previous immutable tags.
# Usage (from repo root), after recording known-good tags:
#   export WEB_IMAGE=marketplace-web:2026-09-18-abc1234
#   export FRONTEND_IMAGE=marketplace-frontend:2026-09-18-abc1234
#   ./backend/scripts/rollback_compose.sh
#
# Or pass previous tags explicitly:
#   PREVIOUS_WEB_IMAGE=... PREVIOUS_FRONTEND_IMAGE=... ./backend/scripts/rollback_compose.sh
#
# Does NOT reverse migrations. Does NOT change postgres.
# See docs/ROLLBACK_REHEARSAL.md / PRODUCTION_CHECKLIST §4.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -n "${PREVIOUS_WEB_IMAGE:-}" ]]; then
  export WEB_IMAGE="$PREVIOUS_WEB_IMAGE"
fi
if [[ -n "${PREVIOUS_FRONTEND_IMAGE:-}" ]]; then
  export FRONTEND_IMAGE="$PREVIOUS_FRONTEND_IMAGE"
fi

if [[ -z "${WEB_IMAGE:-}" || -z "${FRONTEND_IMAGE:-}" ]]; then
  echo "ERROR: Set WEB_IMAGE + FRONTEND_IMAGE (or PREVIOUS_WEB_IMAGE + PREVIOUS_FRONTEND_IMAGE)." >&2
  echo "Refuse to roll back without explicit previous immutable tags." >&2
  exit 1
fi

if [[ "$WEB_IMAGE" == *:latest || "$FRONTEND_IMAGE" == *:latest ]]; then
  echo "ERROR: Refuse :latest tags — use git SHA / semver immutable tags." >&2
  exit 1
fi

export SENTRY_RELEASE="${SENTRY_RELEASE:-$WEB_IMAGE}"

echo "Rolling back Compose app services to:"
echo "  WEB_IMAGE=$WEB_IMAGE  (web)"
echo "  FRONTEND_IMAGE=$FRONTEND_IMAGE"
echo "  worker uses WEB_IMAGE; Compose files=${COMPOSE_FILE:-default}"
echo "  (postgres unchanged — no migrate reverse)"
echo ""

docker compose config --quiet
docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 web worker frontend

echo ""
echo "Verifying web, worker, and frontend readiness..."
BASE_URL="${ROLLBACK_BASE_URL:-http://localhost:${FRONTEND_PORT:-8080}}"
curl --fail --silent --show-error "${BASE_URL%/}/api/v1/healthz/" >/dev/null
curl --fail --silent --show-error "${BASE_URL%/}/" >/dev/null
docker compose exec -T worker python manage.py check_background_jobs
docker compose ps web worker frontend

echo ""
echo "Next:"
echo "  curl -fsS http://localhost:8080/api/v1/healthz/"
echo "  docker compose exec web python manage.py check_rollback_rehearsal --profile staging --fail-on-warnings"
echo "  # optional live Stripe test replay:"
echo "  docker compose exec web python manage.py check_rollback_rehearsal --profile staging --smoke-webhook --fail-on-warnings"
echo "Date the rehearsal in docs/ROLLBACK_REHEARSAL.md"
