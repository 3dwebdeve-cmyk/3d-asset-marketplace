"""sitemap.xml: the public pages a search engine should know about.

It lists exactly what the public catalog shows (published items in active categories) and leaves
out placeholders and empty categories, so crawlers spend their time on pages worth indexing.
Addresses are built from FRONTEND_BASE_URL, the public address of the site.
"""

from __future__ import annotations

from urllib.parse import quote
from xml.sax.saxutils import escape

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse, HttpResponseNotAllowed

from plugins.models import Plugin
from products.models import Product

CACHE_KEY = "sitemap:v1"
CACHE_SECONDS = 60 * 60
# The protocol allows 50,000 addresses per file; stay well inside that.
MAX_URLS = 45_000

# Pages that always exist. Account, cart, checkout and admin pages are deliberately absent.
STATIC_PATHS = ("/", "/3d-models", "/plugins", "/categories", "/custom-projects", "/about", "/contact")


def _excluded(setting_name: str, default: tuple[str, ...]) -> set[str]:
    return set(getattr(settings, setting_name, default))


def _slug(value: str) -> str:
    return quote(value, safe="-_.~")


def _entry(base: str, path: str, lastmod=None) -> str:
    stamp = f"<lastmod>{lastmod.date().isoformat()}</lastmod>" if lastmod else ""
    return f"<url><loc>{escape(base + path)}</loc>{stamp}</url>"


def build_sitemap_xml() -> str:
    base = str(settings.FRONTEND_BASE_URL).rstrip("/")
    skip_categories = _excluded("SITEMAP_EXCLUDED_CATEGORY_SLUGS", ("demo-assets",))
    skip_plugin_categories = _excluded("SITEMAP_EXCLUDED_PLUGIN_CATEGORY_SLUGS", ("demo-tools",))

    products = list(
        Product.objects.filter(status=Product.Status.PUBLISHED, category__is_active=True)
        .exclude(category__slug__in=skip_categories)
        .order_by("-updated_at")
        .values("slug", "updated_at", "category__slug")[:MAX_URLS]
    )
    plugins = list(
        Plugin.objects.filter(status=Plugin.Status.PUBLISHED, category__is_active=True)
        .exclude(category__slug__in=skip_plugin_categories)
        .order_by("-updated_at")
        .values("slug", "updated_at")[:MAX_URLS]
    )

    # A category page is listed only once it has something to show; an empty one is thin content.
    category_updated: dict[str, object] = {}
    for item in products:
        slug = item["category__slug"]
        if slug not in category_updated or item["updated_at"] > category_updated[slug]:
            category_updated[slug] = item["updated_at"]

    entries = [_entry(base, path) for path in STATIC_PATHS]
    entries += [
        _entry(base, f"/3d-models/{_slug(slug)}", updated) for slug, updated in sorted(category_updated.items())
    ]
    entries += [_entry(base, f"/products/{_slug(item['slug'])}", item["updated_at"]) for item in products]
    entries += [_entry(base, f"/plugins/{_slug(item['slug'])}", item["updated_at"]) for item in plugins]

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries[:MAX_URLS])
        + "\n</urlset>\n"
    )


def sitemap_view(request: HttpRequest) -> HttpResponse:
    if request.method not in {"GET", "HEAD"}:
        return HttpResponseNotAllowed(["GET", "HEAD"])
    xml = cache.get(CACHE_KEY)
    if xml is None:
        xml = build_sitemap_xml()
        cache.set(CACHE_KEY, xml, CACHE_SECONDS)
    response = HttpResponse(xml, content_type="application/xml; charset=utf-8")
    response["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    return response
