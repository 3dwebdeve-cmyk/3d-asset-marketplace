#!/bin/sh
set -eu

# Wait for PostgreSQL before running the release job or application.
python <<'PY'
import os
import sys
import time

import psycopg2

host = os.environ.get("DB_HOST", "localhost")
port = int(os.environ.get("DB_PORT", "5432"))
name = os.environ["DB_NAME"]
user = os.environ["DB_USER"]
password = os.environ.get("DB_PASSWORD", "")

deadline = time.monotonic() + 60
while True:
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            dbname=name,
            user=user,
            password=password,
            connect_timeout=3,
        )
        conn.close()
        print(f"database ready at {host}:{port}/{name}", flush=True)
        break
    except psycopg2.OperationalError as exc:
        if time.monotonic() >= deadline:
            print(f"database not ready: {exc}", file=sys.stderr, flush=True)
            sys.exit(1)
        time.sleep(1)
PY

# Render's free tier does not provide an interactive shell or pre-deploy
# command. Apply committed migrations after PostgreSQL is reachable and before
# Gunicorn starts so the running code and database schema stay in sync.
echo "Applying database migrations..."
python manage.py migrate --noinput

# BEGIN bootstrap administrator
# Render's free plan has no shell, so ensure_administrator cannot be run by hand. When both
# BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are set, create that administrator. It only
# creates (never resets a password or promotes a customer). A failure is logged and does not
# stop the site. Remove BOOTSTRAP_ADMIN_PASSWORD once the account exists.
if [ "${1:-}" = "gunicorn" ] && [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] && [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  python manage.py bootstrap_administrator || echo "bootstrap administrator was not created (see the message above)" >&2
fi
# END bootstrap administrator

case "${SKIP_STARTUP_CUTOVER:-}" in
  1|true|True|yes|YES|on|ON) ;;
  *)
    case "${DEPLOYMENT_PROFILE:-development}" in
      production|staging)
        python manage.py check_cutover --profile "${DEPLOYMENT_PROFILE}"
        python manage.py check_db_runtime_role
        python manage.py check_package_scanner --check-signatures
        ;;
    esac
    ;;
esac

# BEGIN web background jobs
# Render's free tier has no background worker service, and queued jobs (verification,
# password-reset and order emails) are only sent by `process_background_jobs`. Set
# RUN_BACKGROUND_JOBS_IN_WEB=true to run it beside Gunicorn in this container, restarting
# it if it exits. It does nothing for other commands, so a Compose `worker` is unaffected.
# Spaces are ignored, so "RUN_BACKGROUND_JOBS_IN_WEB= true" still counts as on.
case "$(printf '%s' "${RUN_BACKGROUND_JOBS_IN_WEB:-}" | tr -d '[:space:]')" in
  1|true|True|yes|YES|on|ON)
    if [ "${1:-}" = "gunicorn" ]; then
      echo "Starting the background job processor beside Gunicorn (RUN_BACKGROUND_JOBS_IN_WEB)"
      (
        while true; do
          python manage.py process_background_jobs || echo "background job processor stopped; restarting in 5s" >&2
          sleep 5
        done
      ) &
    fi
    ;;
esac
# END web background jobs

# BEGIN web maintenance loop
# Render's free plan has no cron. RUN_MAINTENANCE_LOOP_IN_WEB=true runs the daily housekeeping
# (prune old records, payment checks, Stripe comparison on a live account) beside Gunicorn.
case "$(printf '%s' "${RUN_MAINTENANCE_LOOP_IN_WEB:-}" | tr -d '[:space:]')" in
  1|true|True|yes|YES|on|ON)
    if [ "${1:-}" = "gunicorn" ]; then
      echo "Starting the daily maintenance loop beside Gunicorn (RUN_MAINTENANCE_LOOP_IN_WEB)"
      (
        while true; do
          python manage.py run_maintenance_loop || echo "maintenance loop stopped; restarting in 60s" >&2
          sleep 60
        done
      ) &
    fi
    ;;
esac
# END web maintenance loop

exec "$@"
