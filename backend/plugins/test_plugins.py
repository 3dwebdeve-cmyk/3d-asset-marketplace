import io
import tempfile
from decimal import Decimal
from zipfile import ZipFile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from plugins.models import Plugin, PluginCategory, PluginFile, PluginImage


def make_image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), color=(40, 100, 180)).save(buffer, format="PNG")
    return buffer.getvalue()


def make_zip_bytes(filename: str = "plugin/main.py") -> bytes:
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(filename, b"print('plugin')")
    return buffer.getvalue()


class PluginTestMixin:
    password = "StrongPass123!"

    def create_users(self) -> None:
        admin_role = Role.objects.get(role_name="Administrator")
        customer_role = Role.objects.get(role_name="Customer")
        self.admin_user = User.objects.create_user(
            email="plugin-admin@example.com",
            full_name="Plugin Admin",
            password=self.password,
            role=admin_role,
            email_verified=True,
        )
        self.customer_user = User.objects.create_user(
            email="plugin-customer@example.com",
            full_name="Plugin Customer",
            password=self.password,
            role=customer_role,
            email_verified=True,
        )

    def authenticate_admin(self) -> None:
        self.client.force_authenticate(user=self.admin_user)


class PluginPublicAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.category = PluginCategory.objects.create(
            name="Blender",
            slug="blender",
        )
        self.published = Plugin.objects.create(
            category=self.category,
            name="Mesh Toolkit",
            slug="mesh-toolkit",
            short_description="Fast mesh tools",
            price=Decimal("29.00"),
            compatibility="Blender 4.x",
            status=Plugin.Status.PUBLISHED,
        )
        self.draft = Plugin.objects.create(
            category=self.category,
            name="Hidden Toolkit",
            slug="hidden-toolkit",
            price=Decimal("19.00"),
            status=Plugin.Status.DRAFT,
        )
        PluginFile.objects.create(
            plugin=self.published,
            file_name="mesh-toolkit.zip",
            file_format="zip",
            file_size=1024,
            storage_path="http://127.0.0.1:8000/media/plugins/files/private.zip",
            version="1.0",
            is_primary=True,
        )

    def test_public_categories_return_only_active_categories(self) -> None:
        PluginCategory.objects.create(name="Inactive", slug="inactive", is_active=False)

        response = self.client.get(
            reverse("plugin_categories:plugin-category-list")
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "blender")

    def test_public_list_returns_only_published_plugins(self) -> None:
        response = self.client.get(reverse("plugins:plugin-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "mesh-toolkit")

    def test_public_list_supports_search_category_and_ordering(self) -> None:
        other = PluginCategory.objects.create(name="Maya", slug="maya")
        Plugin.objects.create(
            category=other,
            name="Rig Toolkit",
            slug="rig-toolkit",
            price=Decimal("49.00"),
            status=Plugin.Status.PUBLISHED,
        )

        response = self.client.get(
            reverse("plugins:plugin-list"),
            {
                "category_id": str(self.category.pk),
                "search": "mesh",
                "ordering": "price",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "mesh-toolkit")

    def test_public_detail_hides_storage_path(self) -> None:
        response = self.client.get(
            reverse(
                "plugins:plugin-detail",
                kwargs={"slug": self.published.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["files"]), 1)
        self.assertNotIn("storage_path", response.data["files"][0])

    def test_public_detail_hides_draft_and_inactive_category_plugins(self) -> None:
        draft_response = self.client.get(
            reverse(
                "plugins:plugin-detail",
                kwargs={"slug": self.draft.slug},
            )
        )
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        published_response = self.client.get(
            reverse(
                "plugins:plugin-detail",
                kwargs={"slug": self.published.slug},
            )
        )

        self.assertEqual(draft_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(published_response.status_code, status.HTTP_404_NOT_FOUND)


class PluginAdminAPITests(PluginTestMixin, APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.create_users()
        self.category = PluginCategory.objects.create(
            name="Blender",
            slug="blender",
        )
        self.plugin = Plugin.objects.create(
            category=self.category,
            name="UV Toolkit",
            slug="uv-toolkit",
            price=Decimal("20.00"),
        )
        self.category_list_url = reverse(
            "plugin_categories_admin:admin-plugin-categories"
        )
        self.plugin_list_url = reverse("plugins_admin:admin-plugins")

    def test_admin_endpoints_require_administrator(self) -> None:
        response = self.client.get(self.plugin_list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(user=self.customer_user)
        response = self.client.get(self.plugin_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_creates_and_updates_plugin_category(self) -> None:
        self.authenticate_admin()

        create = self.client.post(
            self.category_list_url,
            {"name": "Maya", "description": "Maya plugins"},
            format="json",
        )
        detail_url = reverse(
            "plugin_categories_admin:admin-plugin-category-detail",
            kwargs={"category_id": create.data["id"]},
        )
        update = self.client.patch(
            detail_url,
            {"name": "Autodesk Maya"},
            format="json",
        )

        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["slug"], "autodesk-maya")

    def test_category_cannot_deactivate_with_non_archived_plugins(self) -> None:
        self.authenticate_admin()
        detail_url = reverse(
            "plugin_categories_admin:admin-plugin-category-detail",
            kwargs={"category_id": self.category.pk},
        )

        response = self.client.delete(detail_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", response.data)

    def test_admin_creates_plugin_and_normalizes_fields(self) -> None:
        self.authenticate_admin()

        response = self.client.post(
            self.plugin_list_url,
            {
                "category_id": str(self.category.pk),
                "name": "Render Assistant",
                "price": "30.00",
                "currency": "usd",
                "version": " 2.0 ",
                "compatibility": "Blender 4.x",
                "status": "published",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["currency"], "USD")
        self.assertEqual(response.data["version"], "2.0")
        self.assertEqual(response.data["slug"], "render-assistant")

    def test_admin_rejects_inactive_category_and_invalid_discount(self) -> None:
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        self.authenticate_admin()

        inactive_response = self.client.post(
            self.plugin_list_url,
            {
                "category_id": str(self.category.pk),
                "name": "Invalid Plugin",
                "price": "10.00",
            },
            format="json",
        )
        discount_response = self.client.patch(
            reverse(
                "plugins_admin:admin-plugin-detail",
                kwargs={"plugin_id": self.plugin.pk},
            ),
            {"discount_price": "25.00"},
            format="json",
        )

        self.assertEqual(inactive_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category_id", inactive_response.data)
        self.assertEqual(discount_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_price", discount_response.data)

    def test_admin_updates_and_archives_plugin(self) -> None:
        self.authenticate_admin()
        detail_url = reverse(
            "plugins_admin:admin-plugin-detail",
            kwargs={"plugin_id": self.plugin.pk},
        )

        update = self.client.patch(
            detail_url,
            {"name": "UV Toolkit Pro", "price": "25.00"},
            format="json",
        )
        archive = self.client.delete(detail_url)

        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data["slug"], "uv-toolkit-pro")
        self.assertEqual(archive.status_code, status.HTTP_200_OK)
        self.assertEqual(archive.data["status"], Plugin.Status.ARCHIVED)

    def test_admin_list_validates_filters(self) -> None:
        self.authenticate_admin()

        response = self.client.get(self.plugin_list_url, {"status": "unknown"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)


class PluginModelConstraintTests(TestCase):
    def setUp(self) -> None:
        category = PluginCategory.objects.create(name="Blender", slug="blender")
        self.plugin = Plugin.objects.create(
            category=category,
            name="Constraint Toolkit",
            slug="constraint-toolkit",
            price=Decimal("20.00"),
        )

    def test_database_rejects_discount_above_price(self) -> None:
        with self.assertRaises(IntegrityError), transaction.atomic():
            Plugin.objects.filter(pk=self.plugin.pk).update(
                discount_price=Decimal("21.00")
            )

    def test_database_allows_only_one_primary_image_and_file(self) -> None:
        PluginImage.objects.create(
            plugin=self.plugin,
            image_url="https://example.com/one.png",
            is_primary=True,
        )
        PluginFile.objects.create(
            plugin=self.plugin,
            file_name="one.zip",
            file_format="zip",
            file_size=100,
            storage_path="https://example.com/one.zip",
            is_primary=True,
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PluginImage.objects.create(
                plugin=self.plugin,
                image_url="https://example.com/two.png",
                is_primary=True,
            )
        with self.assertRaises(IntegrityError), transaction.atomic():
            PluginFile.objects.create(
                plugin=self.plugin,
                file_name="two.zip",
                file_format="zip",
                file_size=100,
                storage_path="https://example.com/two.zip",
                is_primary=True,
            )


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PluginMediaAPITests(PluginTestMixin, APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.create_users()
        self.category = PluginCategory.objects.create(
            name="Blender",
            slug="blender",
        )
        self.plugin = Plugin.objects.create(
            category=self.category,
            name="Node Toolkit",
            slug="node-toolkit",
            price=Decimal("15.00"),
        )
        self.other_plugin = Plugin.objects.create(
            category=self.category,
            name="Other Toolkit",
            slug="other-toolkit",
            price=Decimal("12.00"),
        )
        self.image_url = reverse(
            "plugins_admin:admin-plugin-images",
            kwargs={"plugin_id": self.plugin.pk},
        )
        self.file_url = reverse(
            "plugins_admin:admin-plugin-files",
            kwargs={"plugin_id": self.plugin.pk},
        )

    def test_upload_image_sets_thumbnail(self) -> None:
        self.authenticate_admin()
        image = SimpleUploadedFile(
            "preview.png",
            make_image_bytes(),
            content_type="image/png",
        )

        response = self.client.post(
            self.image_url,
            {"image": image, "is_primary": True},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("/media/plugins/images/", response.data["image_url"])
        self.plugin.refresh_from_db()
        self.assertEqual(self.plugin.thumbnail, response.data["image_url"])

    def test_upload_valid_zip_package(self) -> None:
        self.authenticate_admin()
        archive = SimpleUploadedFile(
            "node-toolkit.zip",
            make_zip_bytes(),
            content_type="application/zip",
        )

        response = self.client.post(
            self.file_url,
            {"file": archive, "version": "1.2", "is_primary": True},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["file_format"], "zip")
        self.assertTrue(response.data["is_primary"])
        self.assertIn("/media/plugins/files/", response.data["storage_path"])

    def test_upload_rejects_dangerous_extension_and_fake_archive(self) -> None:
        self.authenticate_admin()
        executable = SimpleUploadedFile(
            "plugin.exe",
            b"MZ executable",
            content_type="application/octet-stream",
        )
        fake_zip = SimpleUploadedFile(
            "plugin.zip",
            b"not a zip archive",
            content_type="application/zip",
        )

        extension_response = self.client.post(
            self.file_url,
            {"file": executable},
            format="multipart",
        )
        content_response = self.client.post(
            self.file_url,
            {"file": fake_zip},
            format="multipart",
        )

        self.assertEqual(extension_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(content_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_rejects_zip_path_traversal(self) -> None:
        self.authenticate_admin()
        archive = SimpleUploadedFile(
            "unsafe.zip",
            make_zip_bytes("../escape.py"),
            content_type="application/zip",
        )

        response = self.client.post(
            self.file_url,
            {"file": archive},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)

    def test_file_delete_is_scoped_to_plugin(self) -> None:
        self.authenticate_admin()
        other_file = PluginFile.objects.create(
            plugin=self.other_plugin,
            file_name="other.zip",
            file_format="zip",
            file_size=100,
            storage_path="http://127.0.0.1:8000/media/plugins/files/other.zip",
        )
        delete_url = reverse(
            "plugins_admin:admin-plugin-file-detail",
            kwargs={
                "plugin_id": self.plugin.pk,
                "file_id": other_file.pk,
            },
        )

        response = self.client.delete(delete_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(PluginFile.objects.filter(pk=other_file.pk).exists())

    def test_delete_image_and_file(self) -> None:
        self.authenticate_admin()
        image = PluginImage.objects.create(
            plugin=self.plugin,
            image_url="http://127.0.0.1:8000/media/plugins/images/example.png",
        )
        plugin_file = PluginFile.objects.create(
            plugin=self.plugin,
            file_name="plugin.zip",
            file_format="zip",
            file_size=100,
            storage_path="http://127.0.0.1:8000/media/plugins/files/example.zip",
        )

        image_response = self.client.delete(
            reverse(
                "plugins_admin:admin-plugin-image-detail",
                kwargs={"plugin_id": self.plugin.pk, "image_id": image.pk},
            )
        )
        file_response = self.client.delete(
            reverse(
                "plugins_admin:admin-plugin-file-detail",
                kwargs={"plugin_id": self.plugin.pk, "file_id": plugin_file.pk},
            )
        )

        self.assertEqual(image_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(file_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PluginImage.objects.filter(pk=image.pk).exists())
        self.assertFalse(PluginFile.objects.filter(pk=plugin_file.pk).exists())
