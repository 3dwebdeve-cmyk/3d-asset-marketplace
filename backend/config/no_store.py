"""Keep sign-in and administrator answers out of every cache.

Sign-in, token refresh, the current user and every administrator API answer belong to one
person. A browser, proxy or CDN that kept a copy could show it again after sign-out, after a
restart, or to the next person on a shared computer. These paths always get
``Cache-Control: no-store`` (with ``private``, ``no-cache`` and ``Expires`` for old caches),
replacing whatever the view set.

Any other answer to a request that carried an access token gets the same headers unless the
view chose its own caching (the public catalog does).
"""

from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.utils.cache import add_never_cache_headers

NO_STORE_PREFIXES: tuple[str, ...] = (
    "/api/v1/auth/",
    "/api/v1/admin/",
    "/api/auth/",
    "/api/admin/",
    "/admin/",
)


def must_not_be_stored(request: HttpRequest, response: HttpResponse) -> bool:
    if request.path.startswith(NO_STORE_PREFIXES):
        return True
    return "HTTP_AUTHORIZATION" in request.META and not response.has_header("Cache-Control")


class NoStoreMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if must_not_be_stored(request, response):
            # Replace, not merge: a view's "public, max-age=…" must not survive on these paths.
            if response.has_header("Cache-Control"):
                del response["Cache-Control"]
            add_never_cache_headers(response)
            response["Pragma"] = "no-cache"
        return response
