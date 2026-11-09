#!/usr/bin/env bash
# Run every scheduled check, then fail the overall run if any task failed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

passed=0
failed=0
failed_tasks=()

run_task() {
  local name="$1"
  shift
  local result
  echo "maintenance_task_started task=$name"
  if "$@"; then
    passed=$((passed + 1))
    echo "maintenance_task_passed task=$name"
  else
    result=$?
    failed=$((failed + 1))
    failed_tasks+=("$name")
    echo "maintenance_task_failed task=$name exit_code=$result" >&2
  fi
}

run_task approval_reminders docker compose exec -T web python manage.py send_review_reminders
run_task retention docker compose exec -T web python manage.py prune_expired_records --execute
run_task background_job_retention docker compose exec -T worker python manage.py manage_background_jobs prune --older-than-days 30 --execute
run_task background_worker_health docker compose exec -T worker python manage.py check_background_jobs
run_task payment_consistency docker compose exec -T web python manage.py check_payment_reconciliation
run_task stripe_reconciliation docker compose exec -T web python manage.py reconcile_stripe_payments
run_task scanner_health docker compose exec -T web python manage.py check_package_scanner --check-signatures
run_task capacity docker compose exec -T web python manage.py check_capacity
run_task backup_freshness bash "$ROOT/backend/scripts/check_backup_freshness.sh"

echo "maintenance_finished passed=$passed failed=$failed"
if (( failed > 0 )); then
  echo "maintenance_failed_tasks ${failed_tasks[*]}" >&2
  exit 1
fi
