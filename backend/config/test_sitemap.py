"""sitemap.xml lists what the public catalog shows, and nothing a search engine should skip."""

import xml.etree.ElementTree as ET
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings

from categories.models import Category
from plugins.models import Plugin, PluginCategory
from products.models import Product

NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
URL = "/api/v1/sitemap.xml"


def _parse(content: bytes):
    # The XML here is the sitemap our own view just produced, never input from outside, so the
    # standard parser is safe. One place carries the scanner exception instead of every call.
    return ET.fromstring(content)  # nosec B314


def _locs(response) -> list[str]:
    root = _parse(response.content)
    return [node.text for node in root.findall("sm:url/sm:loc", NS)]


@override_settings(FRONTEND_BASE_URL="https://assethive3d.com/")
class SitemapTests(TestCase):
    def setUp(self):
        cache.clear()
        self.furniture = Category.objects.create(name="Furniture", slug="furniture")
        self.lights = Category.objects.create(name="Lights", slug="lights")
        self.hidden = Category.objects.create(name="Old", slug="old", is_active=False)
        self.demo = Category.objects.create(name="Demo Assets", slug="demo-assets")
        self.chair = Product.objects.create(
            category=self.furniture, name="Oak Chair", slug="oak-chair",
            price=Decimal("29.99"), status=Product.Status.PUBLISHED,
        )
        Product.objects.create(
            category=self.furniture, name="Draft Sofa", slug="draft-sofa",
            price=Decimal("39.99"), status=Product.Status.DRAFT,
        )
        Product.objects.create(
            category=self.hidden, name="Hidden Lamp", slug="hidden-lamp",
            price=Decimal("9.99"), status=Product.Status.PUBLISHED,
        )
        Product.objects.create(
            category=self.demo, name="Demo Pot", slug="demo-pot",
            price=Decimal("1.99"), status=Product.Status.PUBLISHED,
        )
        tools = PluginCategory.objects.create(name="Tools", slug="tools", is_active=True)
        demo_tools = PluginCategory.objects.create(name="Demo Tools", slug="demo-tools", is_active=True)
        Plugin.objects.create(category=tools, name="UV Kit", slug="uv-kit", price=Decimal("5"), status=Plugin.Status.PUBLISHED)
        Plugin.objects.create(category=tools, name="Draft Kit", slug="draft-kit", price=Decimal("5"), status=Plugin.Status.DRAFT)
        Plugin.objects.create(category=demo_tools, name="Demo Kit", slug="demo-kit", price=Decimal("5"), status=Plugin.Status.PUBLISHED)

    def test_is_public_xml_with_a_cache_header(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/xml", response["Content-Type"])
        self.assertIn("max-age=3600", response["Cache-Control"])
        self.assertEqual(_parse(response.content).tag, "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset")

    def test_lists_the_fixed_public_pages_but_never_private_ones(self):
        locs = _locs(self.client.get(URL))
        for path in ("/", "/3d-models", "/plugins", "/categories", "/custom-projects", "/about", "/contact"):
            self.assertIn(f"https://assethive3d.com{path}" if path != "/" else "https://assethive3d.com/", locs)
        joined = " ".join(locs)
        for private in ("/cart", "/checkout", "/dashboard", "/login", "/register", "/profile", "/console", "/admin"):
            self.assertNotIn(private, joined)

    def test_lists_published_products_and_plugins_in_active_categories(self):
        locs = _locs(self.client.get(URL))
        self.assertIn("https://assethive3d.com/products/oak-chair", locs)
        self.assertIn("https://assethive3d.com/plugins/uv-kit", locs)

    def test_leaves_out_drafts_inactive_categories_and_placeholders(self):
        locs = _locs(self.client.get(URL))
        for slug in ("draft-sofa", "hidden-lamp", "demo-pot", "draft-kit", "demo-kit"):
            self.assertFalse(any(slug in loc for loc in locs), slug)

    def test_lists_a_category_only_once_it_has_something_to_show(self):
        locs = _locs(self.client.get(URL))
        self.assertIn("https://assethive3d.com/3d-models/furniture", locs)
        self.assertNotIn("https://assethive3d.com/3d-models/lights", locs)  # empty
        self.assertNotIn("https://assethive3d.com/3d-models/old", locs)  # inactive
        self.assertNotIn("https://assethive3d.com/3d-models/demo-assets", locs)  # placeholder

    def test_shows_when_a_page_last_changed(self):
        root = _parse(self.client.get(URL).content)
        stamps = {
            node.find("sm:loc", NS).text: node.find("sm:lastmod", NS)
            for node in root.findall("sm:url", NS)
        }
        self.assertIsNone(stamps["https://assethive3d.com/about"])  # fixed pages have no date
        modified = stamps["https://assethive3d.com/products/oak-chair"]
        self.assertEqual(modified.text, self.chair.updated_at.date().isoformat())

    def test_uses_the_configured_public_address_and_escapes_unsafe_characters(self):
        from config.sitemap import _entry

        # Slugs cannot hold these characters, but nothing unescaped may ever reach the file.
        self.assertEqual(_entry("https://x.test", "/a?b=1&c=2"), "<url><loc>https://x.test/a?b=1&amp;c=2</loc></url>")
        self.assertEqual(_entry("https://x.test", "/<b>"), "<url><loc>https://x.test/&lt;b&gt;</loc></url>")

    def test_only_get_and_head_are_allowed(self):
        self.assertEqual(self.client.post(URL).status_code, 405)
        self.assertEqual(self.client.head(URL).status_code, 200)

    def test_is_cached_so_crawlers_cannot_hammer_the_database(self):
        self.client.get(URL)
        # The cache itself lives in the database: one lookup, and the catalog queries do not run again.
        with self.assertNumQueries(1):
            self.client.get(URL)

    @override_settings(FRONTEND_BASE_URL="https://shop.example.test")
    def test_follows_the_site_address_after_the_cache_expires(self):
        cache.clear()
        self.assertIn("https://shop.example.test/about", _locs(self.client.get(URL)))
