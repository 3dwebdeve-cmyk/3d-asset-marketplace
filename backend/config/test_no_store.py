from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase

from config.no_store import NoStoreMiddleware


def _run(path: str, *, cache_control: str | None = None, **headers) -> HttpResponse:
    def view(_request):
        response = HttpResponse("{}")
        if cache_control is not None:
            response["Cache-Control"] = cache_control
        return response

    return NoStoreMiddleware(view)(RequestFactory().get(path, **headers))


class NoStoreMiddlewareTests(SimpleTestCase):
    def assertNoStore(self, response: HttpResponse) -> None:
        cache_control = response["Cache-Control"]
        for directive in ("no-store", "no-cache", "private", "max-age=0"):
            self.assertIn(directive, cache_control)
        self.assertNotIn("public", cache_control)
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertTrue(response.has_header("Expires"))

    def test_sign_in_and_admin_answers_are_never_stored(self) -> None:
        for path in (
            "/api/v1/auth/login/",
            "/api/v1/auth/token/refresh/",
            "/api/v1/auth/admin/me/",
            "/api/v1/admin/products/",
            "/admin/login/",
        ):
            with self.subTest(path=path):
                self.assertNoStore(_run(path))

    def test_a_view_cannot_make_an_admin_answer_public(self) -> None:
        self.assertNoStore(_run("/api/v1/admin/products/", cache_control="public, max-age=300"))

    def test_signed_in_answers_without_their_own_caching_are_not_stored(self) -> None:
        self.assertNoStore(_run("/api/v1/orders/", HTTP_AUTHORIZATION="Bearer x"))

    def test_public_catalog_keeps_its_caching(self) -> None:
        public = "public, max-age=60, s-maxage=300"
        self.assertEqual(_run("/api/v1/products/", cache_control=public)["Cache-Control"], public)
        self.assertEqual(
            _run("/api/v1/products/", cache_control=public, HTTP_AUTHORIZATION="Bearer x")[
                "Cache-Control"
            ],
            public,
        )
        self.assertFalse(_run("/api/v1/products/").has_header("Cache-Control"))
