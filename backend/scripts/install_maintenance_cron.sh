#!/usr/bin/env bash
# Install daily retention and health checks on a Linux deployment host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEDULE="${MAINTENANCE_CRON_SCHEDULE:-35 2 * * *}"
LOG_FILE="${MAINTENANCE_CRON_LOG:-$ROOT/maintenance.log}"
MARKER="# marketplace-phase3-maintenance"
COMPOSE_FILES="${COMPOSE_FILE:-docker-compose.yml}"
LINE="$SCHEDULE (cd '$ROOT' && export COMPOSE_FILE='$COMPOSE_FILES' && docker compose exec -T web python manage.py prune_expired_records --execute && docker compose exec -T worker python manage.py manage_background_jobs prune --older-than-days 30 --execute && docker compose exec -T worker python manage.py check_background_jobs && docker compose exec -T web python manage.py check_payment_reconciliation && docker compose exec -T web python manage.py reconcile_stripe_payments && docker compose exec -T web python manage.py check_package_scanner --check-signatures && docker compose exec -T web python manage.py check_capacity && ./backend/scripts/check_backup_freshness.sh) >> '$LOG_FILE' 2>&1 || echo 'marketplace maintenance failed; inspect log' $MARKER"

if [[ "${INSTALL_MAINTENANCE_CRON_DRY_RUN:-0}" == "1" ]]; then
  echo "$LINE"
  exit 0
fi
command -v crontab >/dev/null || { echo "crontab is required" >&2; exit 1; }
EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | grep -vF "$MARKER" || true)"
{ printf '%s\n' "$FILTERED"; printf '%s\n' "$LINE"; } | grep -v '^$' | crontab -
echo "Daily maintenance installed; monitor $LOG_FILE for failures."
