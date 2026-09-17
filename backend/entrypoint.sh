#!/bin/sh
set -eu

# Wait for PostgreSQL before migrate / Gunicorn.
python <<'PY'
import os
import sys
import time
import urllib.error
import urllib.request

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

meili_url = os.environ.get("MEILI_URL", "").rstrip("/")
if meili_url:
    health_url = f"{meili_url}/health"
    meili_deadline = time.monotonic() + 60
    while True:
        try:
            with urllib.request.urlopen(health_url, timeout=3) as response:
                if 200 <= response.status < 300:
                    print(f"meilisearch ready at {meili_url}", flush=True)
                    break
        except (urllib.error.URLError, TimeoutError) as exc:
            if time.monotonic() >= meili_deadline:
                print(f"meilisearch not ready: {exc}", file=sys.stderr, flush=True)
                sys.exit(1)
            time.sleep(1)
PY

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
