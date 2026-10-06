"""Fail closed when a public app process connects as a database owner/admin."""

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Verify the connected runtime PostgreSQL role has DML but no DDL/admin rights."

    def handle(self, *args, **options):
        expected = (os.environ.get("DB_RUNTIME_USER") or "").strip()
        migrator = (os.environ.get("DB_MIGRATION_USER") or "").strip()
        if settings.DEPLOYMENT_PROFILE in {"staging", "production"} and (
            not expected or not migrator or expected == migrator
        ):
            raise CommandError("Distinct DB_RUNTIME_USER and DB_MIGRATION_USER are required.")
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT current_user, r.rolsuper, r.rolcreatedb, r.rolcreaterole, "
                "has_database_privilege(current_user, current_database(), 'CREATE'), "
                "has_schema_privilege(current_user, 'public', 'CREATE'), "
                "has_schema_privilege(current_user, 'public', 'USAGE') "
                "FROM pg_roles r WHERE r.rolname = current_user"
            )
            row = cursor.fetchone()
            if not row:
                raise CommandError("Could not inspect the PostgreSQL role.")
            name, superuser, createdb, createrole, db_create, schema_create, schema_usage = row
            if expected and name != expected:
                raise CommandError("Connected PostgreSQL role differs from DB_RUNTIME_USER.")
            if any((superuser, createdb, createrole, db_create, schema_create)) or not schema_usage:
                raise CommandError("Runtime PostgreSQL role has DDL/admin rights or lacks schema usage.")
            cursor.execute(
                "SELECT has_table_privilege(current_user, 'public.django_migrations', 'SELECT'), "
                "has_table_privilege(current_user, 'public.django_migrations', 'INSERT'), "
                "has_table_privilege(current_user, 'public.django_migrations', 'UPDATE'), "
                "has_table_privilege(current_user, 'public.django_migrations', 'DELETE')"
            )
            if not all(cursor.fetchone()):
                raise CommandError("Runtime PostgreSQL role lacks table DML grants.")
        self.stdout.write("runtime database role restricted and usable")
