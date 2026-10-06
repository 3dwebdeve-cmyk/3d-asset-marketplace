"""Transaction-scoped locks shared across PostgreSQL web workers."""

import hashlib
from contextlib import contextmanager

from django.db import connection, transaction


@contextmanager
def advisory_lock(key: str):
    lock_id = int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], 'big', signed=True)
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [lock_id])
        yield


@contextmanager
def session_advisory_lock(key: str):
    """Serialize external API work without holding a database transaction open.

    Session locks are released explicitly and also on a lost DB connection.
    Callers must not close the connection while the lock is held.
    """
    lock_id = int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], 'big', signed=True)
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_lock(%s)', [lock_id])
    try:
        yield
    finally:
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_unlock(%s)', [lock_id])
