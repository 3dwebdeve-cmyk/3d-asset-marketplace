from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from time import sleep

from django.db import close_old_connections
from django.test import TransactionTestCase

from config.idempotency import get_or_set
from payments.models import IdempotencyRecord


class IdempotencyConcurrencyTests(TransactionTestCase):
    def test_simultaneous_requests_run_producer_once(self):
        barrier = Barrier(2)
        calls = []

        def produce():
            calls.append(True)
            sleep(0.05)
            return {"order_id": "stable"}, 201

        def request():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return get_or_set("concurrent-checkout", produce)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: request(), range(2)))
        self.assertEqual(len(calls), 1)
        self.assertEqual(results[0], results[1])
        self.assertEqual(IdempotencyRecord.objects.count(), 1)
