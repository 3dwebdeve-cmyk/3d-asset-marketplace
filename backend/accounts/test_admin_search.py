from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from orders.models import Order
from plugins.models import Plugin, PluginCategory
from products.models import Product


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AdminSearchTests(APITestCase):
    url = "/api/v1/admin/search/"

    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user(
            email="admin-search@example.com", full_name="Search Administrator", password="SearchTestPass123!",
            role=Role.objects.get(role_name="Administrator"),
        )
        self.customer = User.objects.create_user(
            email="chair-buyer@example.com", full_name="Chair Buyer", password="SearchTestPass123!",
            role=Role.objects.get(role_name="Customer"),
        )
        category = Category.objects.create(name="Furniture", slug="search-furniture")
        self.product = Product.objects.create(category=category, name="Oak Chair", sku="MDL-000142", price=10)
        plugin_category = PluginCategory.objects.create(name="Tools", slug="search-tools")
        self.plugin = Plugin.objects.create(category=plugin_category, name="Chair Tools", price=10)
        self.order = Order.objects.create(user=self.customer, invoice_number="INV-SEARCH-123", total_amount=10)

    def test_rejects_anonymous_and_customer_access(self):
        self.assertEqual(self.client.get(self.url, {"q": "chair"}).status_code, 401)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(self.url, {"q": "chair"}).status_code, 403)

    def test_searches_all_groups_and_keeps_response_private(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url, {"q": " CHAIR "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "no-store")
        for key, record in (("products", self.product), ("plugins", self.plugin),
                            ("users", self.customer), ("orders", self.order)):
            self.assertEqual(response.data[key][0]["id"], str(record.id))
            self.assertEqual(set(response.data[key][0]), {"id", "label", "detail"})

    def test_sku_invoice_and_email_search(self):
        self.client.force_authenticate(self.admin)
        for query, group, record in (("MDL-000142", "products", self.product),
                                      ("INV-SEARCH-123", "orders", self.order),
                                      ("chair-buyer@", "users", self.customer)):
            response = self.client.get(self.url, {"q": query})
            self.assertEqual(response.data[group][0]["id"], str(record.id))

    def test_limits_results_and_handles_empty_short_and_long_queries(self):
        self.client.force_authenticate(self.admin)
        for query in ("", "c", "nothing-matches-this"):
            response = self.client.get(self.url, {"q": query})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(all(not items for items in response.data.values()))
        self.assertEqual(self.client.get(self.url, {"q": "x" * 121}).status_code, 400)
        for index in range(8):
            Order.objects.create(user=self.customer, invoice_number=f"INV-MORE-{index}", total_amount=10)
        response = self.client.get(self.url, {"q": self.customer.email})
        self.assertEqual(len(response.data["orders"]), 5)

