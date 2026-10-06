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

exec "$@"
