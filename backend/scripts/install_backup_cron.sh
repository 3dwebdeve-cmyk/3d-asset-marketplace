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
#   BACKUP_RETENTION_DAYS  default: 30 (local copies)
#   BACKUP_UPLOAD_R2       default: 1
#   BACKUP_CRON_LOG        default: /var/log/marketplace-backup.log
#   INSTALL_BACKUP_CRON_DRY_RUN=1  print the line without writing crontab
#
# The backup bucket's 30-day lock rule and lifecycle are NOT installed here —
# configure them in Cloudflare (docs/BACKUP_RESTORE_DRILL.md).
# BACKUP_AGE_RECIPIENT and the R2_BACKUP_* keys are read from .env.backup by backup_postgres.sh.
# See docs/BACKUP_RESTORE_DRILL.md.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

SCHEDULE="${BACKUP_CRON_SCHEDULE:-15 2 * * *}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
UPLOAD_R2="${BACKUP_UPLOAD_R2:-1}"
BACKUP_OBJECTS="${BACKUP_OBJECTS:-1}"
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

if [[ "$UPLOAD_R2" == "1" ]] && ! grep -qs "^BACKUP_AGE_RECIPIENT=age1" "$ROOT_DIR/.env.backup" \
    && [[ -z "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  echo "install_backup_cron: set BACKUP_AGE_RECIPIENT in .env.backup first; uploads are always encrypted" >&2
  exit 1
fi

if [[ ! "$RETENTION" =~ ^[1-9][0-9]*$ ]]; then
  echo "install_backup_cron: BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

CRON_LINE="${SCHEDULE} cd ${ROOT_DIR} && BACKUP_RETENTION_DAYS=${RETENTION} BACKUP_UPLOAD_R2=${UPLOAD_R2} BACKUP_OBJECTS=${BACKUP_OBJECTS} ${SCRIPT} >> ${LOG_FILE} 2>&1"

if [[ "${INSTALL_BACKUP_CRON_DRY_RUN:-0}" == "1" ]]; then
  echo "install_backup_cron: dry-run line:"
  echo "$CRON_LINE"
  echo "install_backup_cron: note — the backup bucket lock rule (postgres/, snapshots/) is set in Cloudflare."
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
echo "install_backup_cron: schedule=${SCHEDULE} retention_days=${RETENTION} upload_r2=${UPLOAD_R2} objects=${BACKUP_OBJECTS}"
echo "install_backup_cron: log=${LOG_FILE}"
echo "install_backup_cron: confirm with: crontab -l | grep backup_postgres"
echo "install_backup_cron: in Cloudflare, lock the backup bucket for 30 days and expire objects after 31."
