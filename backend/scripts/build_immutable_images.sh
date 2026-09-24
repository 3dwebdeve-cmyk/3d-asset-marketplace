#!/usr/bin/env bash
# Build and tag immutable Compose images for Phase K1 / PRODUCTION_CHECKLIST §4.
# Usage (from repo root):
#   ./backend/scripts/build_immutable_images.sh
#   IMAGE_TAG=2026-09-19-abc1234 ./backend/scripts/build_immutable_images.sh
#   IMAGE_REGISTRY=ghcr.io/org ./backend/scripts/build_immutable_images.sh
#
# Writes recommended env exports for docker compose up. Does not push unless PUSH=1.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${IMAGE_TAG:-}" ]]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --short HEAD >/dev/null 2>&1; then
    IMAGE_TAG="$(date -u +%Y-%m-%d)-$(git rev-parse --short HEAD)"
  else
    IMAGE_TAG="$(date -u +%Y%m%dT%H%M%SZ)"
  fi
fi

REGISTRY="${IMAGE_REGISTRY:-}"
if [[ -n "$REGISTRY" ]]; then
  REGISTRY="${REGISTRY%/}/"
fi

WEB_IMAGE="${WEB_IMAGE:-${REGISTRY}marketplace-web:${IMAGE_TAG}}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-${REGISTRY}marketplace-frontend:${IMAGE_TAG}}"

export WEB_IMAGE FRONTEND_IMAGE IMAGE_TAG
export SENTRY_RELEASE="${SENTRY_RELEASE:-$IMAGE_TAG}"

echo "Building immutable tags:"
echo "  IMAGE_TAG=$IMAGE_TAG"
echo "  WEB_IMAGE=$WEB_IMAGE"
echo "  FRONTEND_IMAGE=$FRONTEND_IMAGE"
echo "  SENTRY_RELEASE=$SENTRY_RELEASE"

docker compose build web worker frontend

if [[ "${PUSH:-0}" == "1" ]]; then
  docker compose push web worker frontend
fi

echo ""
echo "Record these for rollback (PRODUCTION_CHECKLIST §4 / CUTOVER checklist):"
echo "  export IMAGE_TAG=$IMAGE_TAG"
echo "  export WEB_IMAGE=$WEB_IMAGE"
echo "  export FRONTEND_IMAGE=$FRONTEND_IMAGE"
echo "  export SENTRY_RELEASE=$SENTRY_RELEASE"
echo "Then: docker compose up -d"
echo "Gate: docker compose exec web python manage.py check_cutover --profile staging --fail-on-warnings"
echo "Rollback to a previous tag later:"
echo "  PREVIOUS_WEB_IMAGE=<old-web> PREVIOUS_FRONTEND_IMAGE=<old-frontend> ./backend/scripts/rollback_compose.sh"
echo "  docker compose exec web python manage.py check_rollback_rehearsal --profile staging"
