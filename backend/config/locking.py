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
