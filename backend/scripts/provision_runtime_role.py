"""Run once with migration/admin credentials; never from the web container."""

import os
import sys

import psycopg2
from psycopg2 import sql


def main():
    database = os.environ["DB_NAME"]
    migrator = os.environ["DB_MIGRATION_USER"]
    migration_password = os.environ["DB_MIGRATION_PASSWORD"]
    runtime = os.environ["DB_RUNTIME_USER"]
    runtime_password = os.environ["DB_RUNTIME_PASSWORD"]
    if not runtime or runtime == migrator or len(runtime_password) < 12:
        raise SystemExit("Use distinct roles and a runtime password of at least 12 characters.")
    with psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=os.environ.get("DB_PORT", "5432"),
        dbname=database,
        user=migrator,
        password=migration_password,
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", [runtime])
            if cur.fetchone():
                cur.execute(sql.SQL("ALTER ROLE {} LOGIN PASSWORD %s").format(sql.Identifier(runtime)), [runtime_password])
            else:
                cur.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD %s").format(sql.Identifier(runtime)), [runtime_password])
            cur.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(sql.Identifier(database), sql.Identifier(runtime)))
            cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(runtime)))
            cur.execute(sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}").format(sql.Identifier(runtime)))
            cur.execute(sql.SQL("GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO {}").format(sql.Identifier(runtime)))
            cur.execute(sql.SQL("ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {}").format(sql.Identifier(migrator), sql.Identifier(runtime)))
            cur.execute(sql.SQL("ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO {}").format(sql.Identifier(migrator), sql.Identifier(runtime)))
            cur.execute(
                "SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, "
                "has_database_privilege(%s, %s, 'CREATE'), "
                "has_schema_privilege(%s, 'public', 'CREATE') "
                "FROM pg_roles r WHERE r.rolname=%s",
                [runtime, database, runtime, runtime],
            )
            if any(cur.fetchone()):
                raise RuntimeError("Runtime role already has DDL/admin rights; refusing to commit grants.")
    print("Runtime role provisioned. Run check_db_runtime_role using runtime credentials.")


if __name__ == "__main__":
    main()
