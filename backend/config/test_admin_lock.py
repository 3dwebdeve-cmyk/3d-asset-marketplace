"""Django /admin/ lock middleware (does not touch /api/v1/admin/)."""

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from config.admin_lock import (
    DjangoAdminLockMiddleware,
    is_django_admin_path,
    parse_allowed_networks,
)


class DjangoAdminLockHelperTests(SimpleTestCase):
    def test_path_detection(self) -> None:
        self.assertTrue(is_django_admin_path("/admin/"))
        self.assertTrue(is_django_admin_path("/admin/login/"))
        self.assertFalse(is_django_admin_path("/api/v1/admin/products/"))
        self.assertFalse(is_django_admin_path("/console/login"))

    def test_parse_cidrs(self) -> None:
        networks = parse_allowed_networks("127.0.0.1, 10.0.0.0/8")
        self.assertEqual(len(networks), 2)


class DjangoAdminLockMiddlewareTests(SimpleTestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()

        def ok(_request):
            return HttpResponse("ok")

        self.middleware = DjangoAdminLockMiddleware(ok)

    @override_settings(DJANGO_ADMIN_ENABLED=True, DJANGO_ADMIN_ALLOWED_IPS=[])
    def test_api_admin_unaffected(self) -> None:
        request = self.factory.get("/api/v1/admin/orders/")
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)

    @override_settings(DJANGO_ADMIN_ENABLED=False, DJANGO_ADMIN_ALLOWED_IPS=[])
    def test_disabled_returns_404(self) -> None:
        request = self.factory.get("/admin/")
        response = self.middleware(request)
        self.assertEqual(response.status_code, 404)

    @override_settings(
        DJANGO_ADMIN_ENABLED=True,
        DJANGO_ADMIN_ALLOWED_IPS=["10.0.0.0/8"],
    )
    def test_allowlist_forbidden(self) -> None:
        request = self.factory.get("/admin/", REMOTE_ADDR="203.0.113.9")
        response = self.middleware(request)
        self.assertEqual(response.status_code, 403)

    @override_settings(
        DJANGO_ADMIN_ENABLED=True,
        DJANGO_ADMIN_ALLOWED_IPS=["10.0.0.0/8"],
    )
    def test_allowlist_permits_matching_ip(self) -> None:
        request = self.factory.get("/admin/", REMOTE_ADDR="10.1.2.3")
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)
