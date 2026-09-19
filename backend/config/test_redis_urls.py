"""Optional Redis AUTH URL helpers."""

from django.test import SimpleTestCase

from config.redis_urls import apply_redis_password, redis_url_has_password


class RedisUrlHelperTests(SimpleTestCase):
    def test_detects_password(self) -> None:
        self.assertFalse(redis_url_has_password("redis://redis:6379/1"))
        self.assertTrue(redis_url_has_password("redis://:secret@redis:6379/1"))
        self.assertFalse(redis_url_has_password("memory://"))
        self.assertFalse(redis_url_has_password(""))

    def test_injects_when_missing(self) -> None:
        self.assertEqual(
            apply_redis_password("redis://redis:6379/1", "s3cret"),
            "redis://:s3cret@redis:6379/1",
        )

    def test_keeps_existing_password(self) -> None:
        url = "redis://:already@redis:6379/0"
        self.assertEqual(apply_redis_password(url, "other"), url)

    def test_blank_password_is_noop(self) -> None:
        self.assertEqual(
            apply_redis_password("redis://redis:6379/1", ""),
            "redis://redis:6379/1",
        )
