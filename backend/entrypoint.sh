#!/bin/sh
set -eu

# Wait for PostgreSQL before migrate / Gunicorn.
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

skip_migrate=0
case "${SKIP_STARTUP_MIGRATE:-}" in
  1|true|True|yes|YES|on|ON) skip_migrate=1 ;;
esac

if [ "$skip_migrate" -eq 0 ]; then
  python manage.py migrate --noinput
  python manage.py createcachetable
  python manage.py collectstatic --noinput
else
  echo "skipping migrate/collectstatic (SKIP_STARTUP_MIGRATE)"
fi

exec "$@"
