#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${BACKUP_DIR:-$ROOT/backups}"
MAX_MINUTES="${BACKUP_MAX_AGE_MINUTES:-2160}"
[[ "$MAX_MINUTES" =~ ^[1-9][0-9]*$ ]] || { echo "Invalid BACKUP_MAX_AGE_MINUTES" >&2; exit 2; }
[[ -d "$DIR" ]] || { echo "No backup directory" >&2; exit 1; }
if ! find "$DIR" -maxdepth 1 -type f -name 'marketplace-*.dump' -mmin "-${MAX_MINUTES}" -print -quit | grep -q .; then
  echo "No recent PostgreSQL backup dump" >&2
  exit 1
fi
echo "Recent PostgreSQL backup dump present; run disposable restore drill to verify recoverability."
