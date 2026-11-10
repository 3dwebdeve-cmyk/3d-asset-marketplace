"""Create the local E2E database named in DB_NAME if it does not exist (docs/E2E_LOCAL.md).

Run from the backend folder: the database login comes from backend/.env.
"""

import os

import psycopg2
from decouple import Config, RepositoryEnv
from psycopg2 import sql

env = Config(RepositoryEnv(".env"))
name = os.environ["DB_NAME"]
if not name.startswith("assethive_e2e_"):
    raise SystemExit(f"Refusing to create {name!r}: E2E databases are named assethive_e2e_<name>.")

conn = psycopg2.connect(
    dbname="postgres",
    user=env("DB_USER"),
    password=env("DB_PASSWORD"),
    host=env("DB_HOST", default="localhost"),
    port=env("DB_PORT", default="5432"),
)
conn.autocommit = True
with conn.cursor() as cur:
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", [name])
    if cur.fetchone() is None:
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        print(f"created database {name}")
    else:
        print(f"database {name} exists")
conn.close()
