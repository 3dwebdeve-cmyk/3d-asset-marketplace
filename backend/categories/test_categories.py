from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category


class CategoryPublicAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.parent = Category.objects.create(
            name="Furniture",
            slug="furniture",
            description="Furniture models",
        )
        self.child = Category.objects.create(
            name="Chairs",
            slug="chairs",
            description="Chair models",
            parent=self.parent,
        )
        self.inactive = Category.objects.create(
            name="Hidden",
            slug="hidden",
            is_active=False,
        )
        self.list_url = reverse("categories:category-list")
        self.detail_url = reverse("categories:category-detail", kwargs={"slug": "furniture"})

    def test_list_returns_only_active_categories(self) -> None:
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        slugs = {item["slug"] for item in response.data["results"]}
        self.assertEqual(slugs, {"furniture", "chairs"})

    def test_list_filters_by_parent(self) -> None:
        response = self.client.get(self.list_url, {"parent_id": str(self.parent.pk)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "chairs")

    def test_detail_returns_active_category(self) -> None:
        response = self.client.get(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["slug"], "furniture")
        self.assertEqual(response.data["parent"], None)

    def test_detail_hides_inactive_category(self) -> None:
        url = reverse("categories:category-detail", kwargs={"slug": "hidden"})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_record_click_increments_active_category(self) -> None:
        url = reverse(
            "categories:category-click",
            kwargs={"category_id": self.parent.pk},
        )
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.parent.pk))
        self.assertEqual(response.data["click_count"], 1)
        self.parent.refresh_from_db()
        self.assertEqual(self.parent.click_count, 1)

    def test_record_click_rejects_inactive_category(self) -> None:
        url = reverse(
            "categories:category-click",
            kwargs={"category_id": self.inactive.pk},
        )
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.inactive.refresh_from_db()
        self.assertEqual(self.inactive.click_count, 0)

    def test_trending_returns_top_level_by_click_count(self) -> None:
        second = Category.objects.create(name="Toys", slug="toys", click_count=5)
        self.parent.click_count = 2
        self.parent.save(update_fields=["click_count", "updated_at"])
        # Child with higher clicks must not appear (top-level only).
        self.child.click_count = 99
        self.child.save(update_fields=["click_count", "updated_at"])

        url = reverse("categories:category-trending")
        response = self.client.get(url, {"limit": 12})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertLessEqual(len(response.data), 12)
        slugs = [item["slug"] for item in response.data]
        self.assertEqual(slugs[0], "toys")
        self.assertIn("furniture", slugs)
        self.assertNotIn("chairs", slugs)
        self.assertEqual(slugs.index("toys"), 0)
        self.assertLess(slugs.index("toys"), slugs.index("furniture"))
        self.assertEqual(second.slug, "toys")


class CategoryAdminAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.admin_user = User.objects.create_user(
            email="category-admin@example.com",
            full_name="Category Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="category-customer@example.com",
            full_name="Category Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.category = Category.objects.create(name="Vehicles", slug="vehicles")
        self.list_url = reverse("categories_admin:admin-categories")
        self.detail_url = reverse(
            "categories_admin:admin-category-detail",
            kwargs={"category_id": self.category.pk},
        )
        self.admin_login_url = reverse("accounts:admin-login")

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_admin_list_requires_administrator(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_create_category(self) -> None:
        self._authenticate_as_admin()

        response = self.client.post(
            self.list_url,
            {
                "name": "Architecture",
                "description": "Buildings and structures",
                "parent_id": str(self.category.pk),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["slug"], "architecture")
        self.assertEqual(response.data["parent"]["slug"], "vehicles")
        self.assertTrue(Category.objects.filter(slug="architecture").exists())

    def test_admin_update_category(self) -> None:
        self._authenticate_as_admin()

        response = self.client.patch(
            self.detail_url,
            {"description": "Updated description"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.category.refresh_from_db()
        self.assertEqual(self.category.description, "Updated description")

    def test_admin_deactivate_category(self) -> None:
        self._authenticate_as_admin()

        response = self.client.delete(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.category.refresh_from_db()
        self.assertFalse(self.category.is_active)

    def test_admin_cannot_deactivate_category_with_active_children(self) -> None:
        Category.objects.create(name="Cars", slug="cars", parent=self.category)
        self._authenticate_as_admin()

        response = self.client.delete(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", response.data)
        self.category.refresh_from_db()
        self.assertTrue(self.category.is_active)

    def test_admin_rejects_circular_parent(self) -> None:
        child = Category.objects.create(name="Trucks", slug="trucks", parent=self.category)
        self._authenticate_as_admin()

        response = self.client.patch(
            self.detail_url,
            {"parent_id": str(child.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("parent_id", response.data)
