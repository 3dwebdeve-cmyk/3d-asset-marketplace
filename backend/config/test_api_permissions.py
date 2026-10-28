"""Who may call each API endpoint, and the security policy the API sends to browsers."""

import json
import os
import subprocess
import sys

from django.test import SimpleTestCase
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from config.test_admin_ip_lock_optout import BASE_ENV


def _api_views():
    """(route, view class) for every Django REST Framework endpoint."""

    def walk(patterns, prefix=""):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns, prefix + str(pattern.pattern))
            elif isinstance(pattern, URLPattern):
                view_class = getattr(pattern.callback, "view_class", None) or getattr(
                    pattern.callback, "cls", None
                )
                if view_class is not None and issubclass(view_class, APIView):
                    yield prefix + str(pattern.pattern), view_class

    return list(walk(get_resolver().url_patterns))


def _declares_own_rule(view_class) -> bool:
    for klass in view_class.__mro__:
        if klass.__module__.split(".")[0] == "rest_framework":
            continue
        if "permission_classes" in klass.__dict__ or "get_permissions" in klass.__dict__:
            return True
    return False


class EndpointPermissionTests(SimpleTestCase):
    def test_every_endpoint_says_who_may_call_it(self):
        views = _api_views()
        self.assertGreater(len(views), 50)
        missing = [f"{route} ({view.__name__})" for route, view in views if not _declares_own_rule(view)]
        self.assertEqual(
            missing,
            [],
            "Set permission_classes on these views (AllowAny for public ones).",
        )

    def test_an_endpoint_without_a_rule_needs_a_signed_in_user(self):
        class ForgotItsRule(APIView):
            def get(self, request):
                return Response({"secret": True})

        response = ForgotItsRule.as_view()(APIRequestFactory().get("/api/v1/forgot/"))
        self.assertEqual(response.status_code, 401)


def _csp_for(**overrides):
    env = os.environ.copy()
    env.update(BASE_ENV)
    env.update({"ADMIN_CONSOLE_IP_LOCK_OFF": "true"})
    env.update(overrides)
    result = subprocess.run(
        [sys.executable, "-c", "import json; from config import settings as s; print(json.dumps(s.SECURE_CSP))"],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout.strip().splitlines()[-1])


class ApiSecurityPolicyTests(SimpleTestCase):
    def test_production_api_lets_a_browser_load_or_run_nothing(self):
        policy = _csp_for()
        self.assertEqual(policy["default-src"], ["'none'"])
        for directive in ("object-src", "base-uri", "frame-ancestors", "form-action"):
            self.assertEqual(policy[directive], ["'none'"], directive)
        self.assertNotIn("script-src", policy)
        self.assertNotIn("style-src", policy)

    def test_local_development_keeps_the_admin_pages_working(self):
        policy = _csp_for(DEBUG="True", DEPLOYMENT_PROFILE="development", DJANGO_ADMIN_ENABLED="True")
        self.assertIn("'unsafe-inline'", policy["script-src"])
        self.assertEqual(policy["frame-ancestors"], ["'none'"])
