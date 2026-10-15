"""Cloudflare Worker -> Render: the visitor IP is trusted only with the shared secret."""

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings
from rest_framework.throttling import BaseThrottle

from config.admin_lock import DjangoAdminLockMiddleware, request_client_ip
from config.edge import TrustedEdgeMiddleware

SECRET = "e" * 48
OTHER_SECRET = "f" * 48
rf = RequestFactory()


def _call(path="/api/v1/products/", *, secret=None, ip=None, real_ip=None, forwarded=None, peer="10.0.0.5"):
    """Run the middleware; return (response, request as the next layer saw it)."""
    extra = {"REMOTE_ADDR": peer}
    if secret is not None:
        extra["HTTP_X_EDGE_SECRET"] = secret
    if ip is not None:
        extra["HTTP_X_EDGE_CLIENT_IP"] = ip
    if real_ip is not None:
        extra["HTTP_X_REAL_IP"] = real_ip
    if forwarded is not None:
        extra["HTTP_X_FORWARDED_FOR"] = forwarded
    seen = {}

    def view(request):
        seen["request"] = request
        return HttpResponse("ok")

    return TrustedEdgeMiddleware(view)(rf.get(path, **extra)), seen.get("request")


@override_settings(EDGE_SHARED_SECRET=SECRET, EDGE_REQUIRE=False)
class VisitorIpTests(SimpleTestCase):
    def test_runs_after_django_security_but_before_every_ip_reader(self):
        from django.conf import settings

        order = list(settings.MIDDLEWARE)
        edge = order.index("config.edge.TrustedEdgeMiddleware")
        self.assertGreater(edge, order.index("django.middleware.security.SecurityMiddleware"))
        self.assertLess(edge, order.index("config.admin_lock.DjangoAdminLockMiddleware"))

    def test_correct_secret_makes_the_worker_ip_the_visitor_ip_everywhere(self):
        response, request = _call(secret=SECRET, ip="198.51.100.7")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(request.edge_verified)
        self.assertEqual(request.META["REMOTE_ADDR"], "198.51.100.7")
        self.assertEqual(request_client_ip(request), "198.51.100.7")
        # Rate limits and login lockouts read this one.
        self.assertEqual(BaseThrottle().get_ident(request), "198.51.100.7")

    def test_a_forged_forwarded_for_cannot_override_the_verified_ip(self):
        _, request = _call(secret=SECRET, ip="198.51.100.7", forwarded="203.0.113.1, 203.0.113.2")
        self.assertEqual(BaseThrottle().get_ident(request), "198.51.100.7")

    def test_ipv6_is_accepted_and_normalised(self):
        _, request = _call(secret=SECRET, ip="2001:DB8::0001")
        self.assertEqual(request_client_ip(request), "2001:db8::1")

    def test_edge_headers_never_reach_the_app(self):
        _, request = _call(secret=SECRET, ip="198.51.100.7")
        self.assertNotIn("HTTP_X_EDGE_SECRET", request.META)
        self.assertNotIn("HTTP_X_EDGE_CLIENT_IP", request.META)

    def test_wrong_secret_removes_a_forged_real_ip(self):
        response, request = _call(secret=OTHER_SECRET, ip="198.51.100.7", real_ip="198.51.100.7")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(request.edge_verified)
        self.assertEqual(request_client_ip(request), "10.0.0.5")

    def test_no_secret_removes_a_forged_real_ip(self):
        _, request = _call(real_ip="198.51.100.7")
        self.assertFalse(request.edge_verified)
        self.assertEqual(request_client_ip(request), "10.0.0.5")

    def test_unusable_ip_with_the_right_secret_is_not_trusted(self):
        for bad in ("not-an-ip", "", "198.51.100.7, 203.0.113.1", "198.51.100.7:443"):
            with self.subTest(bad=bad):
                _, request = _call(secret=SECRET, ip=bad, real_ip="198.51.100.7")
                self.assertTrue(request.edge_verified)
                self.assertEqual(request_client_ip(request), "10.0.0.5")

    @override_settings(EDGE_SHARED_SECRET="")
    def test_off_when_no_secret_is_configured(self):
        # Docker Compose behind nginx: nginx's X-Real-IP is used exactly as before.
        _, request = _call(real_ip="198.51.100.7", secret=SECRET, ip="203.0.113.1")
        self.assertEqual(request_client_ip(request), "198.51.100.7")
        self.assertFalse(hasattr(request, "edge_verified"))


@override_settings(EDGE_SHARED_SECRET=SECRET, EDGE_REQUIRE=True)
class RequireEdgeTests(SimpleTestCase):
    def test_a_direct_call_to_the_render_address_is_refused(self):
        response, request = _call("/api/v1/products/")
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(request)
        self.assertIn(b"edge_required", response.content)

    def test_a_wrong_secret_is_refused(self):
        self.assertEqual(_call(secret=OTHER_SECRET, ip="198.51.100.7")[0].status_code, 403)

    def test_requests_through_the_worker_are_allowed(self):
        self.assertEqual(_call(secret=SECRET, ip="198.51.100.7")[0].status_code, 200)

    def test_stripe_webhook_and_health_check_stay_reachable(self):
        for path in ("/api/v1/payments/webhook/", "/api/v1/healthz/"):
            with self.subTest(path=path):
                self.assertEqual(_call(path)[0].status_code, 200)

    def test_other_payment_routes_are_not_exempt(self):
        self.assertEqual(_call("/api/v1/payments/checkout/")[0].status_code, 403)

    @override_settings(EDGE_REQUIRE=False)
    def test_not_enforced_until_switched_on(self):
        self.assertEqual(_call("/api/v1/products/")[0].status_code, 200)


@override_settings(EDGE_SHARED_SECRET=SECRET, ADMIN_CONSOLE_ALLOWED_IPS=["198.51.100.7"])
class AdminAllowlistBehindTheWorkerTests(SimpleTestCase):
    """The admin allowlist works with real visitor IPs and cannot be talked around."""

    def _status(self, **kwargs):
        lock = DjangoAdminLockMiddleware(lambda request: HttpResponse("ok"))
        extra = {"REMOTE_ADDR": "10.0.0.5"}
        for header, value in (
            ("HTTP_X_EDGE_SECRET", kwargs.get("secret")),
            ("HTTP_X_EDGE_CLIENT_IP", kwargs.get("ip")),
            ("HTTP_X_REAL_IP", kwargs.get("real_ip")),
        ):
            if value is not None:
                extra[header] = value
        request = rf.get("/api/v1/admin/products/", **extra)
        return TrustedEdgeMiddleware(lock)(request).status_code

    def test_allowlisted_visitor_through_the_worker_is_allowed(self):
        self.assertEqual(self._status(secret=SECRET, ip="198.51.100.7"), 200)

    def test_other_visitor_through_the_worker_is_refused(self):
        self.assertEqual(self._status(secret=SECRET, ip="203.0.113.99"), 403)

    def test_forged_real_ip_does_not_open_the_admin_lock(self):
        self.assertEqual(self._status(real_ip="198.51.100.7"), 403)

    def test_forged_real_ip_with_a_wrong_secret_does_not_open_the_admin_lock(self):
        self.assertEqual(self._status(secret=OTHER_SECRET, ip="198.51.100.7", real_ip="198.51.100.7"), 403)
