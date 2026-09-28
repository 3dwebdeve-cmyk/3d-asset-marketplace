"""Django /admin/ and SPA console API network locks."""

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from config.admin_lock import (
    DjangoAdminLockMiddleware,
    is_django_admin_path,
    is_spa_admin_api_path,
    parse_allowed_networks,
)


class DjangoAdminLockHelperTests(SimpleTestCase):
    def test_path_detection(self) -> None:
        self.assertTrue(is_django_admin_path("/admin/"))
        self.assertTrue(is_django_admin_path("/admin/login/"))
        self.assertFalse(is_django_admin_path("/api/v1/admin/products/"))
        self.assertFalse(is_django_admin_path("/console/login"))

    def test_spa_admin_api_path_detection(self) -> None:
        self.assertTrue(is_spa_admin_api_path("/api/v1/auth/admin/login/"))
        self.assertTrue(is_spa_admin_api_path("/api/v1/auth/admin/me/"))
        self.assertTrue(is_spa_admin_api_path("/api/v1/admin/products/"))
        self.assertTrue(is_spa_admin_api_path("/api/v1/admin/orders/"))
        self.assertFalse(is_spa_admin_api_path("/api/v1/auth/login/"))
        self.assertFalse(is_spa_admin_api_path("/api/v1/products/"))
        self.assertFalse(is_spa_admin_api_path("/console/login"))

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
    def test_api_admin_unaffected_without_console_allowlist(self) -> None:
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


class SpaAdminConsoleLockMiddlewareTests(SimpleTestCase):
    def setUp(self) -> None:
        self.factory = RequestFactory()

        def ok(_request):
            return HttpResponse("ok")

        self.middleware = DjangoAdminLockMiddleware(ok)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=[])
    def test_empty_allowlist_open(self) -> None:
        request = self.factory.post(
            "/api/v1/auth/admin/login/",
            REMOTE_ADDR="203.0.113.9",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_login_forbidden_outside_network(self) -> None:
        request = self.factory.post(
            "/api/v1/auth/admin/login/",
            REMOTE_ADDR="203.0.113.9",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 403)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_login_allowed_on_company_network(self) -> None:
        request = self.factory.post(
            "/api/v1/auth/admin/login/",
            REMOTE_ADDR="10.20.30.40",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_admin_api_forbidden_outside_network(self) -> None:
        request = self.factory.get(
            "/api/v1/admin/products/",
            REMOTE_ADDR="198.51.100.1",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 403)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_spoofed_cf_connecting_ip_is_ignored(self) -> None:
        request = self.factory.post(
            "/api/v1/auth/admin/login/",
            REMOTE_ADDR="203.0.113.9",
            HTTP_CF_CONNECTING_IP="10.0.0.1",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 403)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_spoofed_x_forwarded_for_is_ignored(self) -> None:
        request = self.factory.get(
            "/api/v1/admin/products/",
            REMOTE_ADDR="203.0.113.9",
            HTTP_X_FORWARDED_FOR="10.0.0.1",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 403)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_nginx_real_ip_outside_network_forbidden_even_if_peer_matches(self) -> None:
        # Behind Nginx the TCP peer is the (private) Nginx container address.
        request = self.factory.get(
            "/api/v1/admin/products/",
            REMOTE_ADDR="10.5.0.3",
            HTTP_X_REAL_IP="203.0.113.9",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 403)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_nginx_real_ip_inside_network_allowed(self) -> None:
        request = self.factory.get(
            "/api/v1/admin/products/",
            REMOTE_ADDR="172.18.0.4",
            HTTP_X_REAL_IP="10.20.30.40",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)

    @override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["10.0.0.0/8"])
    def test_public_auth_unaffected(self) -> None:
        request = self.factory.post(
            "/api/v1/auth/login/",
            REMOTE_ADDR="203.0.113.9",
        )
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)
