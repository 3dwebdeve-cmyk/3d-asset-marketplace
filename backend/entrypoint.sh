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


def wait_for_http(url: str, timeout: int = 60) -> None:
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if 200 <= response.status < 300:
                    return
        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
        ):
            pass

        time.sleep(1)

    raise RuntimeError(f"service did not become ready: {url}")


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
    try:
        wait_for_http(f"{meili_url}/health")
        print(f"meilisearch ready at {meili_url}", flush=True)
    except RuntimeError as exc:
        print(f"meilisearch not ready: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
PY

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
