#!/usr/bin/env bash
# Install (or refresh) the daily Postgres backup cron entry (Phase A5).
#
# Idempotent: replaces any prior marketplace backup_postgres.sh crontab line.
# Intended for Linux staging/prod hosts (not Windows Task Scheduler).
#
# Usage (from repo root, as the deploy user):
#   ./backend/scripts/install_backup_cron.sh
#
# Env:
#   BACKUP_CRON_SCHEDULE   default: 15 2 * * *  (02:15 UTC daily)
#   BACKUP_RETENTION_DAYS  default: 14
#   BACKUP_UPLOAD_R2       default: 1
#   BACKUP_CRON_LOG        default: /var/log/marketplace-backup.log
#   INSTALL_BACKUP_CRON_DRY_RUN=1  print the line without writing crontab
#
# R2 object lifecycle is NOT installed here — configure Cloudflare separately.
# See docs/BACKUP_RESTORE_DRILL.md.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SCHEDULE="${BACKUP_CRON_SCHEDULE:-15 2 * * *}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
UPLOAD_R2="${BACKUP_UPLOAD_R2:-1}"
LOG_FILE="${BACKUP_CRON_LOG:-/var/log/marketplace-backup.log}"
SCRIPT="${ROOT_DIR}/backend/scripts/backup_postgres.sh"
MARKER="backend/scripts/backup_postgres.sh"

if [[ ! -x "$SCRIPT" && -f "$SCRIPT" ]]; then
  chmod +x "$SCRIPT" || true
fi
if [[ ! -f "$SCRIPT" ]]; then
  echo "install_backup_cron: missing ${SCRIPT}" >&2
  exit 1
fi

if [[ ! "$RETENTION" =~ ^[1-9][0-9]*$ ]]; then
  echo "install_backup_cron: BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

CRON_LINE="${SCHEDULE} cd ${ROOT_DIR} && BACKUP_RETENTION_DAYS=${RETENTION} BACKUP_UPLOAD_R2=${UPLOAD_R2} ${SCRIPT} >> ${LOG_FILE} 2>&1"

if [[ "${INSTALL_BACKUP_CRON_DRY_RUN:-0}" == "1" ]]; then
  echo "install_backup_cron: dry-run line:"
  echo "$CRON_LINE"
  echo "install_backup_cron: note — R2 lifecycle on prefix backups/postgres/ is separate from this cron."
  exit 0
fi

if ! command -v crontab >/dev/null 2>&1; then
  echo "install_backup_cron: crontab not found (Linux host required)" >&2
  exit 1
fi

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$EXISTING" | grep -vF "$MARKER" || true)"
{
  printf '%s\n' "$FILTERED"
  printf '%s\n' "$CRON_LINE"
} | grep -v '^$' | crontab -

echo "install_backup_cron: installed"
echo "install_backup_cron: schedule=${SCHEDULE} retention_days=${RETENTION} upload_r2=${UPLOAD_R2}"
echo "install_backup_cron: log=${LOG_FILE}"
echo "install_backup_cron: confirm with: crontab -l | grep backup_postgres"
echo "install_backup_cron: configure Cloudflare R2 lifecycle on backups/postgres/ separately (30–90 days)."
