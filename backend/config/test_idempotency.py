"""Idempotency helper unit tests."""

from __future__ import annotations

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory

from config.idempotency import (
    build_cache_key,
    get_or_set,
    idempotency_key_from_request,
)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "idempotency-tests",
        }
    }
)
class IdempotencyHelperTests(TestCase):
    def setUp(self) -> None:
        cache.clear()

    def test_build_cache_key(self) -> None:
        self.assertEqual(
            build_cache_key("checkout", 42, "abc"),
            "idempotency:checkout:42:abc",
        )

    def test_get_or_set_caches_success_only(self) -> None:
        calls = {"n": 0}

        def produce_ok():
            calls["n"] += 1
            return {"order_id": "x"}, 201

        key = build_cache_key("checkout", 1, "k1")
        body1, code1 = get_or_set(key, produce_ok)
        body2, code2 = get_or_set(key, produce_ok)
        self.assertEqual(code1, 201)
        self.assertEqual(body1, body2)
        self.assertEqual(code2, 201)
        self.assertEqual(calls["n"], 1)

    def test_get_or_set_does_not_cache_errors(self) -> None:
        calls = {"n": 0}

        def produce_err():
            calls["n"] += 1
            return {"detail": "bad"}, 400

        key = build_cache_key("checkout", 1, "k-err")
        get_or_set(key, produce_err)
        get_or_set(key, produce_err)
        self.assertEqual(calls["n"], 2)

    def test_idempotency_key_from_request(self) -> None:
        factory = APIRequestFactory()
        request = factory.post("/", HTTP_IDEMPOTENCY_KEY="  my-key  ")
        self.assertEqual(idempotency_key_from_request(request), "my-key")
        blank = factory.post("/", HTTP_IDEMPOTENCY_KEY="   ")
        self.assertIsNone(idempotency_key_from_request(blank))
        missing = factory.post("/")
        self.assertIsNone(idempotency_key_from_request(missing))
