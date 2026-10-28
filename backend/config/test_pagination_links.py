"""Page links never carry the server's own host name."""

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from categories.models import Category


@override_settings(ALLOWED_HOSTS=["backend.onrender.example", "testserver"])
class RelativePaginationLinkTests(APITestCase):
    def setUp(self) -> None:
        for index in range(3):
            Category.objects.create(name=f"Category {index}", slug=f"category-{index}")
        self.url = reverse("categories:category-list")

    def test_next_and_previous_are_relative(self) -> None:
        response = self.client.get(self.url, {"page": 2, "page_size": 1}, HTTP_HOST="backend.onrender.example")

        self.assertEqual(response.data["next"], f"{self.url}?page=3&page_size=1")
        # DRF drops page=1 from the first page's address.
        self.assertEqual(response.data["previous"], f"{self.url}?page_size=1")
        self.assertNotIn("onrender", response.content.decode())

    def test_last_page_has_no_next(self) -> None:
        response = self.client.get(self.url, {"page": 3, "page_size": 1})

        self.assertIsNone(response.data["next"])
