import tempfile
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from custom_projects.models import CustomProject, ProjectQuotation


def _png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color=(20, 40, 60)).save(buffer, format="PNG")
    return buffer.getvalue()


class CustomProjectAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_user = User.objects.create_user(
            email="admin-projects@example.com",
            full_name="Admin Projects",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.customer_user = User.objects.create_user(
            email="customer-projects@example.com",
            full_name="Customer Projects",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_list_url = reverse(
            "custom_projects_admin:admin-custom-project-list-create"
        )
        self.customer_list_url = reverse(
            "custom_projects:customer-custom-project-list-create"
        )
        self.admin_login_url = reverse("accounts:admin-login")
        self.customer_login_url = reverse("accounts:login")

    def _authenticate_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_customer(self) -> None:
        response = self.client.post(
            self.customer_login_url,
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_customer_can_create_and_list_own_projects(self) -> None:
        self._authenticate_customer()
        create = self.client.post(
            self.customer_list_url,
            {
                "title": "Custom chair model",
                "description": "Need a game-ready wooden chair with PBR textures.",
                "category": "Furniture",
                "estimated_budget": "150.00",
                "deadline": (date.today() + timedelta(days=14)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["status"], CustomProject.Status.SUBMITTED)
        self.assertNotIn("admin_notes", create.data)

        listed = self.client.get(self.customer_list_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)

    def test_customer_cannot_access_another_customers_project(self) -> None:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Private request",
            description="This project belongs to another customer account.",
        )
        other = User.objects.create_user(
            email="other-customer@example.com",
            full_name="Other Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        login = self.client.post(
            self.customer_login_url,
            {"email": other.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.get(
            reverse(
                "custom_projects:customer-custom-project-detail",
                kwargs={"project_id": project.id},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_list_quote_and_update_status(self) -> None:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Hero prop",
            description="Stylized sci-fi crate with baked lighting.",
            status=CustomProject.Status.SUBMITTED,
        )
        self._authenticate_admin()

        listed = self.client.get(self.admin_list_url, {"search": "Hero"})
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)

        review = self.client.patch(
            reverse(
                "custom_projects_admin:admin-custom-project-detail",
                kwargs={"project_id": project.id},
            ),
            {
                "status": CustomProject.Status.UNDER_REVIEW,
                "assigned_designer_id": str(self.admin_user.id),
                "admin_notes": "Feasible this sprint.",
            },
            format="json",
        )
        self.assertEqual(review.status_code, status.HTTP_200_OK)
        self.assertEqual(review.data["status"], CustomProject.Status.UNDER_REVIEW)
        self.assertEqual(
            review.data["assigned_designer"]["id"],
            str(self.admin_user.id),
        )

        quote = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation",
                kwargs={"project_id": project.id},
            ),
            {
                "amount": "220.00",
                "currency": "USD",
                "estimated_delivery": (date.today() + timedelta(days=21)).isoformat(),
                "notes": "Includes two revision rounds.",
            },
            format="json",
        )
        self.assertEqual(quote.status_code, status.HTTP_200_OK)
        self.assertEqual(quote.data["project"]["status"], CustomProject.Status.QUOTED)
        self.assertEqual(quote.data["quotation"]["amount"], "220.00")
        self.assertTrue(
            ProjectQuotation.objects.filter(project_id=project.id).exists()
        )

        invalid = self.client.patch(
            reverse(
                "custom_projects_admin:admin-custom-project-detail",
                kwargs={"project_id": project.id},
            ),
            {"status": CustomProject.Status.COMPLETED},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_create_for_customer_rejects_administrator_customer(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.admin_list_url,
            {
                "customer_id": str(self.admin_user.id),
                "title": "Invalid owner",
                "description": "Administrators should not be project customers.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer_id", response.data)

    def test_customer_denied_on_admin_endpoints(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CustomProjectFileUploadTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.customer_user = User.objects.create_user(
            email="customer-files@example.com",
            full_name="Customer Files",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Reference upload",
            description="Need reference images attached to this request.",
        )
        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.upload_url = reverse(
            "custom_projects:customer-custom-project-file-upload",
            kwargs={"project_id": self.project.id},
        )

    def test_customer_can_upload_reference_image(self) -> None:
        upload = SimpleUploadedFile(
            "ref.png",
            _png_bytes(),
            content_type="image/png",
        )
        response = self.client.post(
            self.upload_url,
            {"file": upload, "file_type": "reference_image"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["file_name"], "ref.png")
        self.assertNotIn("storage_path", response.data)
        self.assertEqual(self.project.files.count(), 1)

    def test_rejects_invalid_extension(self) -> None:
        upload = SimpleUploadedFile(
            "malware.exe",
            b"MZ",
            content_type="application/octet-stream",
        )
        response = self.client.post(
            self.upload_url,
            {"file": upload, "file_type": "other"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_private_reference_file_requires_authenticated_download(self) -> None:
        upload = SimpleUploadedFile(
            "ref.png",
            _png_bytes(),
            content_type="image/png",
        )
        created = self.client.post(
            self.upload_url,
            {"file": upload, "file_type": "reference_image"},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        project_file = self.project.files.get()
        relative = project_file.storage_path.split("/media/", maxsplit=1)[1]

        public = self.client.get(f"/media/{relative}")
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)

        admin_role = Role.objects.get(role_name="Administrator")
        admin = User.objects.create_user(
            email="admin-download@example.com",
            full_name="Admin Download",
            password=self.password,
            role=admin_role,
            email_verified=True,
        )
        admin.is_staff = True
        admin.save(update_fields=["is_staff", "updated_at"])
        admin_login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": admin.email, "password": self.password},
            format="json",
        )
        self.assertEqual(admin_login.status_code, status.HTTP_200_OK)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {admin_login.data['access']}"
        )
        download_url = reverse(
            "custom_projects_admin:admin-custom-project-file-download",
            kwargs={"project_id": self.project.id, "file_id": project_file.id},
        )
        downloaded = self.client.get(download_url)
        self.assertEqual(downloaded.status_code, status.HTTP_200_OK)

        detail = self.client.get(
            reverse(
                "custom_projects_admin:admin-custom-project-detail",
                kwargs={"project_id": self.project.id},
            )
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertIn("download_url", detail.data["files"][0])
        self.assertNotIn("storage_path", detail.data["files"][0])
