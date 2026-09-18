import tempfile
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from zipfile import ZipFile

from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from custom_projects.models import CustomProject, ProjectDelivery, ProjectMessage, ProjectQuotation
from mail_log.models import OutboundEmailLog
from config.media import media_relative_path


def _png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), color=(20, 40, 60)).save(buffer, format="PNG")
    return buffer.getvalue()


class CustomProjectAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        mail.outbox.clear()
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

    def test_customer_create_emails_active_admins_when_no_designer(self) -> None:
        self._authenticate_customer()
        secret_description = "Do not leak the full customer brief into the email body."
        create = self.client.post(
            self.customer_list_url,
            {
                "title": "Custom chair model",
                "description": secret_description,
                "category": "Furniture",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertEqual(email.to, [self.admin_user.email])
        self.assertIn("Custom chair model", email.subject)
        self.assertIn("Custom chair model", email.body)
        self.assertIn(self.customer_user.full_name, email.body)
        self.assertIn("/admin/projects/", email.body)
        self.assertNotIn(secret_description, email.body)
        self.assertNotIn(self.customer_user.email, email.body)
        self.assertNotIn("/api/", email.body)

    @override_settings(
        PROJECT_MESSAGE_ADMIN_RECIPIENTS=(
            "ops@3dassetmarketplace.local, desk@3dassetmarketplace.local"
        ),
    )
    def test_customer_create_uses_configured_admin_recipients(self) -> None:
        self._authenticate_customer()
        create = self.client.post(
            self.customer_list_url,
            {
                "title": "Configured recipients project",
                "description": "Need a product visualization with configurable recipients.",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            mail.outbox[0].to,
            ["ops@3dassetmarketplace.local", "desk@3dassetmarketplace.local"],
        )

    def test_mail_failure_does_not_break_customer_project_create(self) -> None:
        self._authenticate_customer()
        with patch(
            "config.mail.send_mail",
            side_effect=RuntimeError("SMTP unavailable"),
        ):
            create = self.client.post(
                self.customer_list_url,
                {
                    "title": "Mail failure project",
                    "description": "Project should still be created when email sending fails.",
                },
                format="json",
            )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(CustomProject.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 0)

    def test_admin_create_does_not_send_customer_submission_email(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.admin_list_url,
            {
                "customer_id": str(self.customer_user.id),
                "title": "Admin-created project",
                "description": "Created by staff so it should not trigger customer submission email.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 0)

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

    def test_customer_list_ui_contract_empty_quoted_paginated_and_scoped(self) -> None:
        """Real-world My Projects list: empty → create → quote amount → page → isolation."""
        self._authenticate_customer()

        empty = self.client.get(self.customer_list_url)
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(empty.data["count"], 0)
        self.assertEqual(empty.data["results"], [])

        self.client.credentials()
        unauth = self.client.get(self.customer_list_url)
        self.assertEqual(unauth.status_code, status.HTTP_401_UNAUTHORIZED)
        self._authenticate_customer()

        create = self.client.post(
            self.customer_list_url,
            {
                "title": "Marketplace hero prop",
                "description": "Game-ready crate with PBR textures and LODs.",
                "category": "Props",
                "estimated_budget": "200.00",
                "currency": "USD",
                "deadline": (date.today() + timedelta(days=21)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        project_id = create.data["id"]

        listed = self.client.get(self.customer_list_url, {"page": 1, "page_size": 20})
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)
        item = listed.data["results"][0]
        for field in (
            "id",
            "title",
            "status",
            "updated_at",
            "quotation_amount",
            "currency",
            "payment_status",
        ):
            self.assertIn(field, item)
        self.assertEqual(item["id"], project_id)
        self.assertEqual(item["title"], "Marketplace hero prop")
        self.assertEqual(item["status"], CustomProject.Status.SUBMITTED)
        self.assertIsNone(item["quotation_amount"])
        self.assertNotIn("admin_notes", item)
        self.assertNotIn("customer", item)

        self._authenticate_admin()
        quote = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation",
                kwargs={"project_id": project_id},
            ),
            {
                "amount": "275.50",
                "currency": "USD",
                "notes": "Includes one revision round.",
            },
            format="json",
        )
        self.assertEqual(quote.status_code, status.HTTP_200_OK)

        self._authenticate_customer()
        quoted_list = self.client.get(self.customer_list_url)
        self.assertEqual(quoted_list.status_code, status.HTTP_200_OK)
        quoted_item = quoted_list.data["results"][0]
        self.assertEqual(quoted_item["status"], CustomProject.Status.QUOTED)
        self.assertEqual(quoted_item["quotation_amount"], "275.50")
        self.assertEqual(quoted_item["currency"], "USD")

        detail = self.client.get(
            reverse(
                "custom_projects:customer-custom-project-detail",
                kwargs={"project_id": project_id},
            )
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["quotation"]["amount"], "275.50")
        self.assertEqual(detail.data["quotation"]["status"], "pending")
        self.assertNotIn("admin_notes", detail.data)

        for index in range(2, 6):
            created = self.client.post(
                self.customer_list_url,
                {
                    "title": f"Batch request {index}",
                    "description": f"Additional custom project request number {index}.",
                    "category": "Props",
                },
                format="json",
            )
            self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        page_one = self.client.get(
            self.customer_list_url, {"page": 1, "page_size": 2}
        )
        page_two = self.client.get(
            self.customer_list_url, {"page": 2, "page_size": 2}
        )
        self.assertEqual(page_one.status_code, status.HTTP_200_OK)
        self.assertEqual(page_two.status_code, status.HTTP_200_OK)
        self.assertEqual(page_one.data["count"], 5)
        self.assertEqual(len(page_one.data["results"]), 2)
        self.assertEqual(len(page_two.data["results"]), 2)
        self.assertIsNotNone(page_one.data["next"])
        self.assertIsNotNone(page_two.data["previous"])
        page_one_ids = {row["id"] for row in page_one.data["results"]}
        page_two_ids = {row["id"] for row in page_two.data["results"]}
        self.assertTrue(page_one_ids.isdisjoint(page_two_ids))

        other = User.objects.create_user(
            email="myprojects-other@example.com",
            full_name="Other My Projects",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        other_login = self.client.post(
            self.customer_login_url,
            {"email": other.email, "password": self.password},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {other_login.data['access']}"
        )
        other_list = self.client.get(self.customer_list_url)
        self.assertEqual(other_list.status_code, status.HTTP_200_OK)
        self.assertEqual(other_list.data["count"], 0)
        other_detail = self.client.get(
            reverse(
                "custom_projects:customer-custom-project-detail",
                kwargs={"project_id": project_id},
            )
        )
        self.assertEqual(other_detail.status_code, status.HTTP_404_NOT_FOUND)


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
        relative = media_relative_path(project_file.storage_path)

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

    @override_settings(R2_ENABLED=True, R2_SIGNED_URL_EXPIRY=300)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_reference_file_download_returns_signed_json_when_r2_has_object(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
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
        mock_get_private_storage.return_value.exists.return_value = True
        mock_presign.return_value = (
            "https://acc.r2.cloudflarestorage.com/3dam-private/"
            "custom_projects/files/ref.png?X-Amz-Signature=test"
        )

        admin_role = Role.objects.get(role_name="Administrator")
        admin = User.objects.create_user(
            email="admin-signed-file@example.com",
            full_name="Admin Signed File",
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
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {admin_login.data['access']}"
        )
        download_url = reverse(
            "custom_projects_admin:admin-custom-project-file-download",
            kwargs={"project_id": self.project.id, "file_id": project_file.id},
        )
        response = self.client.get(download_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["download_url"], mock_presign.return_value)
        self.assertEqual(response.data["expires_in"], 300)
        self.assertEqual(response.data["file_name"], project_file.file_name)
        mock_presign.assert_called_once()


class CustomProjectMessageAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_user = User.objects.create_user(
            email="admin-messages@example.com",
            full_name="Admin Messages",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.customer_user = User.objects.create_user(
            email="customer-messages@example.com",
            full_name="Customer Messages",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="other-messages@example.com",
            full_name="Other Messages",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Message thread project",
            description="Project used to exercise project message APIs.",
        )
        self.customer_messages_url = reverse(
            "custom_projects:customer-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
        )
        self.admin_messages_url = reverse(
            "custom_projects_admin:admin-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
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

    def test_customer_can_create_and_list_messages_on_own_project(self) -> None:
        self._authenticate_customer()
        created = self.client.post(
            self.customer_messages_url,
            {"body": "Can we use walnut for the legs?"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["body"], "Can we use walnut for the legs?")
        self.assertEqual(str(created.data["project_id"]), str(self.project.id))
        self.assertEqual(str(created.data["sender"]["id"]), str(self.customer_user.id))
        self.assertEqual(created.data["sender"]["full_name"], "Customer Messages")
        self.assertNotIn("admin_notes", created.data)
        self.assertNotIn("email", created.data["sender"])

        listed = self.client.get(self.customer_messages_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["body"], created.data["body"])
        self.assertNotIn("admin_notes", listed.data["results"][0])

    def test_admin_can_create_and_list_messages_on_any_project(self) -> None:
        self._authenticate_customer()
        self.client.post(
            self.customer_messages_url,
            {"body": "Customer question about dimensions."},
            format="json",
        )

        self._authenticate_admin()
        reply = self.client.post(
            self.admin_messages_url,
            {"body": "Yes, we can adjust the dimensions."},
            format="json",
        )
        self.assertEqual(reply.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(reply.data["sender"]["id"]), str(self.admin_user.id))
        self.assertNotIn("admin_notes", reply.data)

        listed = self.client.get(self.admin_messages_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 2)
        bodies = [item["body"] for item in listed.data["results"]]
        self.assertEqual(
            bodies,
            [
                "Customer question about dimensions.",
                "Yes, we can adjust the dimensions.",
            ],
        )

    def test_unauthenticated_cannot_access_message_endpoints(self) -> None:
        customer_get = self.client.get(self.customer_messages_url)
        customer_post = self.client.post(
            self.customer_messages_url,
            {"body": "Hello"},
            format="json",
        )
        admin_get = self.client.get(self.admin_messages_url)
        admin_post = self.client.post(
            self.admin_messages_url,
            {"body": "Hello"},
            format="json",
        )
        self.assertEqual(customer_get.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(customer_post.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(admin_get.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(admin_post.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_other_customer_cannot_access_project_messages(self) -> None:
        ProjectMessage.objects.create(
            project=self.project,
            sender=self.customer_user,
            body="Secret project discussion.",
        )
        login = self.client.post(
            self.customer_login_url,
            {"email": self.other_customer.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        listed = self.client.get(self.customer_messages_url)
        created = self.client.post(
            self.customer_messages_url,
            {"body": "Trying to inject a message."},
            format="json",
        )
        self.assertEqual(listed.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(created.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(ProjectMessage.objects.filter(project=self.project).count(), 1)

    def test_customer_denied_on_admin_message_endpoint(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.admin_messages_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_message_rejects_empty_and_oversized_body(self) -> None:
        self._authenticate_customer()
        empty = self.client.post(
            self.customer_messages_url,
            {"body": "   "},
            format="json",
        )
        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("body", empty.data)

        oversized = self.client.post(
            self.customer_messages_url,
            {"body": "x" * (ProjectMessage.BODY_MAX_LENGTH + 1)},
            format="json",
        )
        self.assertEqual(oversized.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("body", oversized.data)
        self.assertEqual(ProjectMessage.objects.filter(project=self.project).count(), 0)

    def test_message_list_is_paginated(self) -> None:
        self._authenticate_customer()
        for index in range(21):
            ProjectMessage.objects.create(
                project=self.project,
                sender=self.customer_user,
                body=f"Message number {index}",
            )
        page_one = self.client.get(self.customer_messages_url)
        self.assertEqual(page_one.status_code, status.HTTP_200_OK)
        self.assertEqual(page_one.data["count"], 21)
        self.assertEqual(len(page_one.data["results"]), 20)
        self.assertIsNotNone(page_one.data["next"])
        # Ascending created_at: page 1 is the oldest window (not the newest).
        self.assertEqual(page_one.data["results"][0]["body"], "Message number 0")
        self.assertEqual(page_one.data["results"][-1]["body"], "Message number 19")

        page_two = self.client.get(self.customer_messages_url, {"page": 2})
        self.assertEqual(page_two.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page_two.data["results"]), 1)
        self.assertEqual(page_two.data["results"][0]["body"], "Message number 20")

    def test_message_list_page_size_cap_keeps_newest_on_later_pages(self) -> None:
        self._authenticate_customer()
        for index in range(101):
            ProjectMessage.objects.create(
                project=self.project,
                sender=self.customer_user,
                body=f"Cap message {index}",
            )
        page_one = self.client.get(
            self.customer_messages_url, {"page": 1, "page_size": 100}
        )
        self.assertEqual(page_one.status_code, status.HTTP_200_OK)
        self.assertEqual(page_one.data["count"], 101)
        self.assertEqual(len(page_one.data["results"]), 100)
        self.assertEqual(page_one.data["results"][0]["body"], "Cap message 0")
        self.assertNotEqual(page_one.data["results"][-1]["body"], "Cap message 100")

        page_two = self.client.get(
            self.customer_messages_url, {"page": 2, "page_size": 100}
        )
        self.assertEqual(page_two.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page_two.data["results"]), 1)
        self.assertEqual(page_two.data["results"][0]["body"], "Cap message 100")

    def test_unread_count_on_lists_and_mark_read_clears_it(self) -> None:
        customer_list_url = reverse(
            "custom_projects:customer-custom-project-list-create"
        )
        admin_list_url = reverse(
            "custom_projects_admin:admin-custom-project-list-create"
        )
        customer_mark_read_url = reverse(
            "custom_projects:customer-custom-project-message-mark-read",
            kwargs={"project_id": self.project.id},
        )
        admin_mark_read_url = reverse(
            "custom_projects_admin:admin-custom-project-message-mark-read",
            kwargs={"project_id": self.project.id},
        )

        self._authenticate_admin()
        admin_create = self.client.post(
            self.admin_messages_url,
            {"body": "Studio update for the customer."},
            format="json",
        )
        self.assertEqual(admin_create.status_code, status.HTTP_201_CREATED)

        self._authenticate_customer()
        customer_list = self.client.get(customer_list_url)
        self.assertEqual(customer_list.status_code, status.HTTP_200_OK)
        self.assertEqual(customer_list.data["count"], 1)
        customer_row = customer_list.data["results"][0]
        self.assertEqual(customer_row["unread_count"], 1)
        self.assertTrue(customer_row["has_unread"])

        customer_mark = self.client.post(customer_mark_read_url, {}, format="json")
        self.assertEqual(customer_mark.status_code, status.HTTP_200_OK)
        self.assertEqual(customer_mark.data["unread_count"], 0)
        self.assertEqual(
            str(customer_mark.data["project_id"]),
            str(self.project.id),
        )

        customer_list_after = self.client.get(customer_list_url)
        self.assertEqual(customer_list_after.data["results"][0]["unread_count"], 0)
        self.assertFalse(customer_list_after.data["results"][0]["has_unread"])

        customer_reply = self.client.post(
            self.customer_messages_url,
            {"body": "Thanks — please proceed."},
            format="json",
        )
        self.assertEqual(customer_reply.status_code, status.HTTP_201_CREATED)

        # Own messages must not inflate the customer's unread count.
        customer_list_own = self.client.get(customer_list_url)
        self.assertEqual(customer_list_own.data["results"][0]["unread_count"], 0)

        self._authenticate_admin()
        admin_list = self.client.get(admin_list_url)
        self.assertEqual(admin_list.status_code, status.HTTP_200_OK)
        admin_row = next(
            item
            for item in admin_list.data["results"]
            if str(item["id"]) == str(self.project.id)
        )
        self.assertEqual(admin_row["unread_count"], 1)
        self.assertTrue(admin_row["has_unread"])

        admin_mark = self.client.post(admin_mark_read_url, {}, format="json")
        self.assertEqual(admin_mark.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_mark.data["unread_count"], 0)

        admin_list_after = self.client.get(admin_list_url)
        admin_row_after = next(
            item
            for item in admin_list_after.data["results"]
            if str(item["id"]) == str(self.project.id)
        )
        self.assertEqual(admin_row_after["unread_count"], 0)
        self.assertFalse(admin_row_after["has_unread"])

    def test_mark_read_permission_boundaries(self) -> None:
        customer_mark_read_url = reverse(
            "custom_projects:customer-custom-project-message-mark-read",
            kwargs={"project_id": self.project.id},
        )
        admin_mark_read_url = reverse(
            "custom_projects_admin:admin-custom-project-message-mark-read",
            kwargs={"project_id": self.project.id},
        )

        unauthenticated = self.client.post(customer_mark_read_url, {}, format="json")
        self.assertEqual(unauthenticated.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            self.customer_login_url,
            {"email": self.other_customer.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        other_customer = self.client.post(customer_mark_read_url, {}, format="json")
        self.assertEqual(other_customer.status_code, status.HTTP_404_NOT_FOUND)

        self._authenticate_customer()
        customer_on_admin = self.client.post(admin_mark_read_url, {}, format="json")
        self.assertEqual(customer_on_admin.status_code, status.HTTP_403_FORBIDDEN)

        missing_project_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        missing_customer_url = reverse(
            "custom_projects:customer-custom-project-message-mark-read",
            kwargs={"project_id": missing_project_id},
        )
        missing = self.client.post(missing_customer_url, {}, format="json")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_unread_risk_scenarios_do_not_crash(self) -> None:
        """Real-world unread/read-cursor scenarios that must stay stable (no 5xx)."""
        customer_list_url = reverse(
            "custom_projects:customer-custom-project-list-create"
        )
        admin_list_url = reverse(
            "custom_projects_admin:admin-custom-project-list-create"
        )
        customer_mark_read_url = reverse(
            "custom_projects:customer-custom-project-message-mark-read",
            kwargs={"project_id": self.project.id},
        )
        admin_mark_read_url = reverse(
            "custom_projects_admin:admin-custom-project-message-mark-read",
            kwargs={"project_id": self.project.id},
        )

        second_admin = User.objects.create_user(
            email="admin-messages-2@example.com",
            full_name="Second Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        second_admin.is_staff = True
        second_admin.save(update_fields=["is_staff", "updated_at"])

        # Scenario 1: mark-read on an empty thread (no messages yet).
        self._authenticate_customer()
        empty_mark = self.client.post(customer_mark_read_url, {}, format="json")
        self.assertEqual(empty_mark.status_code, status.HTTP_200_OK)
        self.assertEqual(empty_mark.data["unread_count"], 0)

        empty_list = self.client.get(customer_list_url)
        self.assertEqual(empty_list.status_code, status.HTTP_200_OK)
        self.assertEqual(empty_list.data["results"][0]["unread_count"], 0)

        # Scenario 2: idempotent double mark-read.
        second_mark = self.client.post(customer_mark_read_url, {}, format="json")
        self.assertEqual(second_mark.status_code, status.HTTP_200_OK)
        self.assertEqual(second_mark.data["unread_count"], 0)

        # Scenario 3: multiple studio messages → unread_count accumulates.
        self._authenticate_admin()
        for body in ("First studio note", "Second studio note", "Third studio note"):
            created = self.client.post(
                self.admin_messages_url,
                {"body": body},
                format="json",
            )
            self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        self._authenticate_customer()
        multi_unread = self.client.get(customer_list_url)
        self.assertEqual(multi_unread.status_code, status.HTTP_200_OK)
        self.assertEqual(multi_unread.data["results"][0]["unread_count"], 3)
        self.assertTrue(multi_unread.data["results"][0]["has_unread"])

        # Scenario 4: after mark-read, a new incoming message reintroduces unread.
        cleared = self.client.post(customer_mark_read_url, {}, format="json")
        self.assertEqual(cleared.status_code, status.HTTP_200_OK)
        self.assertEqual(cleared.data["unread_count"], 0)

        self._authenticate_admin()
        new_reply = self.client.post(
            self.admin_messages_url,
            {"body": "New reply after customer read the thread."},
            format="json",
        )
        self.assertEqual(new_reply.status_code, status.HTTP_201_CREATED)

        self._authenticate_customer()
        after_new = self.client.get(customer_list_url)
        self.assertEqual(after_new.status_code, status.HTTP_200_OK)
        self.assertEqual(after_new.data["results"][0]["unread_count"], 1)

        # Scenario 5: per-admin cursors are independent (not studio-wide).
        self._authenticate_customer()
        customer_msg = self.client.post(
            self.customer_messages_url,
            {"body": "Question for both admins."},
            format="json",
        )
        self.assertEqual(customer_msg.status_code, status.HTTP_201_CREATED)

        self._authenticate_admin()
        admin_a_before = self.client.get(admin_list_url)
        self.assertEqual(admin_a_before.status_code, status.HTTP_200_OK)
        admin_a_row = next(
            item
            for item in admin_a_before.data["results"]
            if str(item["id"]) == str(self.project.id)
        )
        self.assertGreaterEqual(admin_a_row["unread_count"], 1)

        admin_a_mark = self.client.post(admin_mark_read_url, {}, format="json")
        self.assertEqual(admin_a_mark.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_a_mark.data["unread_count"], 0)

        admin_a_after = self.client.get(admin_list_url)
        admin_a_row_after = next(
            item
            for item in admin_a_after.data["results"]
            if str(item["id"]) == str(self.project.id)
        )
        self.assertEqual(admin_a_row_after["unread_count"], 0)

        # Second admin has not marked read → still sees unread.
        login_b = self.client.post(
            self.admin_login_url,
            {"email": second_admin.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_b.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_b.data['access']}")

        admin_b_list = self.client.get(admin_list_url)
        self.assertEqual(admin_b_list.status_code, status.HTTP_200_OK)
        admin_b_row = next(
            item
            for item in admin_b_list.data["results"]
            if str(item["id"]) == str(self.project.id)
        )
        self.assertGreaterEqual(admin_b_row["unread_count"], 1)
        self.assertTrue(admin_b_row["has_unread"])

        # Scenario 6: another admin's reply counts as unread for this admin
        # (per-user cursor — not "customer-only" unread).
        other_admin_messages_url = reverse(
            "custom_projects_admin:admin-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
        )
        self._authenticate_admin()
        peer_reply = self.client.post(
            other_admin_messages_url,
            {"body": "I will handle the CAD revisions."},
            format="json",
        )
        self.assertEqual(peer_reply.status_code, status.HTTP_201_CREATED)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_b.data['access']}")
        admin_b_after_peer = self.client.get(admin_list_url)
        self.assertEqual(admin_b_after_peer.status_code, status.HTTP_200_OK)
        admin_b_peer_row = next(
            item
            for item in admin_b_after_peer.data["results"]
            if str(item["id"]) == str(self.project.id)
        )
        self.assertGreaterEqual(admin_b_peer_row["unread_count"], 2)

        # Scenario 7: race-ish flow — mark-read while listing messages still works.
        listed = self.client.get(other_admin_messages_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(listed.data["count"], 1)
        mark_while_open = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-message-mark-read",
                kwargs={"project_id": self.project.id},
            ),
            {},
            format="json",
        )
        self.assertEqual(mark_while_open.status_code, status.HTTP_200_OK)
        self.assertEqual(mark_while_open.data["unread_count"], 0)
        listed_again = self.client.get(other_admin_messages_url)
        self.assertEqual(listed_again.status_code, status.HTTP_200_OK)
        self.assertEqual(listed_again.data["count"], listed.data["count"])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CustomProjectMessageAttachmentAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_user = User.objects.create_user(
            email="admin-msg-attach@example.com",
            full_name="Admin Attach",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.customer_user = User.objects.create_user(
            email="customer-msg-attach@example.com",
            full_name="Customer Attach",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="other-msg-attach@example.com",
            full_name="Other Attach",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Attachment thread project",
            description="Project used to exercise message attachment APIs.",
        )
        self.customer_messages_url = reverse(
            "custom_projects:customer-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
        )
        self.admin_messages_url = reverse(
            "custom_projects_admin:admin-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
        )

    def _authenticate_admin(self) -> None:
        response = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_customer(self) -> None:
        response = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_customer_can_send_message_with_attachment(self) -> None:
        self._authenticate_customer()
        upload = SimpleUploadedFile(
            "sketch.png",
            _png_bytes(),
            content_type="image/png",
        )
        created = self.client.post(
            self.customer_messages_url,
            {"body": "Here is a sketch.", "file": upload},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["body"], "Here is a sketch.")
        self.assertEqual(len(created.data["attachments"]), 1)
        attachment = created.data["attachments"][0]
        self.assertEqual(attachment["file_name"], "sketch.png")
        self.assertNotIn("storage_path", attachment)
        self.assertIn("download_url", attachment)
        self.assertIn("/api/v1/custom-projects/", attachment["download_url"])
        self.assertIn("/attachments/", attachment["download_url"])
        self.assertIn("/download/", attachment["download_url"])

        listed = self.client.get(self.customer_messages_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data["results"][0]["attachments"]), 1)
        self.assertNotIn("storage_path", listed.data["results"][0]["attachments"][0])

    def test_customer_can_send_attachment_without_body(self) -> None:
        self._authenticate_customer()
        upload = SimpleUploadedFile(
            "alone.png",
            _png_bytes(),
            content_type="image/png",
        )
        created = self.client.post(
            self.customer_messages_url,
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["body"], "")
        self.assertEqual(len(created.data["attachments"]), 1)

    def test_rejects_invalid_attachment_extension(self) -> None:
        self._authenticate_customer()
        upload = SimpleUploadedFile(
            "malware.exe",
            b"MZ",
            content_type="application/octet-stream",
        )
        response = self.client.post(
            self.customer_messages_url,
            {"body": "bad file", "file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ProjectMessage.objects.filter(project=self.project).count(), 0)

    def test_rejects_oversized_attachment(self) -> None:
        self._authenticate_customer()
        oversized = SimpleUploadedFile(
            "big.png",
            b"\x89PNG\r\n\x1a\n" + (b"0" * (20 * 1024 * 1024 + 1)),
            content_type="image/png",
        )
        response = self.client.post(
            self.customer_messages_url,
            {"body": "too big", "file": oversized},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ProjectMessage.objects.filter(project=self.project).count(), 0)

    def test_owner_and_admin_can_download_other_customer_cannot(self) -> None:
        self._authenticate_customer()
        upload = SimpleUploadedFile(
            "ref.png",
            _png_bytes(),
            content_type="image/png",
        )
        created = self.client.post(
            self.customer_messages_url,
            {"body": "See attached.", "file": upload},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        message_id = created.data["id"]
        attachment_id = created.data["attachments"][0]["id"]

        customer_download = reverse(
            "custom_projects:customer-custom-project-message-attachment-download",
            kwargs={
                "project_id": self.project.id,
                "message_id": message_id,
                "attachment_id": attachment_id,
            },
        )
        owner_response = self.client.get(customer_download)
        self.assertEqual(owner_response.status_code, status.HTTP_200_OK)

        from custom_projects.models import ProjectMessageAttachment

        attachment = ProjectMessageAttachment.objects.get(pk=attachment_id)
        relative = media_relative_path(attachment.storage_path)
        public = self.client.get(f"/media/{relative}")
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)

        other_login = self.client.post(
            reverse("accounts:login"),
            {"email": self.other_customer.email, "password": self.password},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {other_login.data['access']}"
        )
        other_response = self.client.get(customer_download)
        self.assertEqual(other_response.status_code, status.HTTP_404_NOT_FOUND)

        self._authenticate_admin()
        admin_download = reverse(
            "custom_projects_admin:admin-custom-project-message-attachment-download",
            kwargs={
                "project_id": self.project.id,
                "message_id": message_id,
                "attachment_id": attachment_id,
            },
        )
        admin_response = self.client.get(admin_download)
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)

        admin_listed = self.client.get(self.admin_messages_url)
        self.assertEqual(admin_listed.status_code, status.HTTP_200_OK)
        admin_attachment = admin_listed.data["results"][0]["attachments"][0]
        self.assertIn("/api/v1/admin/custom-projects/", admin_attachment["download_url"])
        self.assertNotIn("storage_path", admin_attachment)

    @override_settings(R2_ENABLED=True, R2_SIGNED_URL_EXPIRY=300)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_attachment_download_returns_signed_json_when_r2_has_object(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        self._authenticate_customer()
        upload = SimpleUploadedFile(
            "ref.png",
            _png_bytes(),
            content_type="image/png",
        )
        created = self.client.post(
            self.customer_messages_url,
            {"body": "Signed path.", "file": upload},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        message_id = created.data["id"]
        attachment = created.data["attachments"][0]
        mock_get_private_storage.return_value.exists.return_value = True
        mock_presign.return_value = (
            "https://acc.r2.cloudflarestorage.com/3dam-private/"
            "custom_projects/messages/ref.png?X-Amz-Signature=test"
        )
        download_url = reverse(
            "custom_projects:customer-custom-project-message-attachment-download",
            kwargs={
                "project_id": self.project.id,
                "message_id": message_id,
                "attachment_id": attachment["id"],
            },
        )
        response = self.client.get(download_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["download_url"], mock_presign.return_value)
        self.assertEqual(response.data["expires_in"], 300)
        self.assertEqual(response.data["file_name"], attachment["file_name"])
        mock_presign.assert_called_once()

    def test_admin_can_send_message_with_attachment(self) -> None:
        self._authenticate_admin()
        upload = SimpleUploadedFile(
            "reply.pdf",
            b"%PDF-1.4 sample",
            content_type="application/pdf",
        )
        created = self.client.post(
            self.admin_messages_url,
            {"body": "Updated quote PDF.", "file": upload},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(created.data["attachments"]), 1)
        self.assertEqual(created.data["attachments"][0]["file_name"], "reply.pdf")
        self.assertNotIn("storage_path", created.data["attachments"][0])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CustomProjectMessageAttachmentRiskScenarioTests(APITestCase):
    """Real-world crash scenarios for message attachment assumptions."""

    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_user = User.objects.create_user(
            email="admin-attach-risk@example.com",
            full_name="Admin Risk",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.customer_user = User.objects.create_user(
            email="customer-attach-risk@example.com",
            full_name="Customer Risk",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Attachment risk project",
            description="Used for attachment crash-risk scenario coverage.",
        )
        self.customer_messages_url = reverse(
            "custom_projects:customer-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
        )
        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_attachment_only_json_body_empty_and_file_do_not_crash(self) -> None:
        """Hypothesis B: attachment-only send returns 201, not 500."""
        upload = SimpleUploadedFile(
            "only.png",
            _png_bytes(),
            content_type="image/png",
        )
        created = self.client.post(
            self.customer_messages_url,
            {"body": "", "file": upload},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["body"], "")
        self.assertEqual(len(created.data["attachments"]), 1)

        listed = self.client.get(self.customer_messages_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["results"][0]["body"], "")
        self.assertEqual(len(listed.data["results"][0]["attachments"]), 1)

    def test_invalid_and_oversized_uploads_return_400_not_500(self) -> None:
        """Hypothesis C: validation failures must not crash the process."""
        invalid = self.client.post(
            self.customer_messages_url,
            {
                "body": "bad",
                "file": SimpleUploadedFile(
                    "bad.exe",
                    b"MZ",
                    content_type="application/octet-stream",
                ),
            },
            format="multipart",
        )
        oversized = self.client.post(
            self.customer_messages_url,
            {
                "body": "big",
                "file": SimpleUploadedFile(
                    "big.png",
                    b"\x89PNG\r\n\x1a\n" + (b"0" * (20 * 1024 * 1024 + 1)),
                    content_type="image/png",
                ),
            },
            format="multipart",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(oversized.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ProjectMessage.objects.filter(project=self.project).count(), 0)

    def test_missing_storage_file_download_returns_404_not_500(self) -> None:
        """Hypothesis D: deleted blob must 404, not crash."""
        from custom_projects.models import ProjectMessageAttachment

        upload = SimpleUploadedFile(
            "gone.png",
            _png_bytes(),
            content_type="image/png",
        )
        created = self.client.post(
            self.customer_messages_url,
            {"body": "will delete file", "file": upload},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        message_id = created.data["id"]
        attachment_id = created.data["attachments"][0]["id"]
        attachment = ProjectMessageAttachment.objects.get(pk=attachment_id)
        relative = media_relative_path(attachment.storage_path)
        self.assertIsNotNone(relative)
        from django.core.files.storage import default_storage

        default_storage.delete(relative)

        download_url = reverse(
            "custom_projects:customer-custom-project-message-attachment-download",
            kwargs={
                "project_id": self.project.id,
                "message_id": message_id,
                "attachment_id": attachment_id,
            },
        )
        missing = self.client.get(download_url)
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_multiple_attachments_on_message_serialize_without_crash(self) -> None:
        """Hypothesis E: model allows many attachments; list must stay stable."""
        from custom_projects.models import ProjectMessageAttachment
        from custom_projects.storage import ProjectMessageAttachmentStorageService

        message = ProjectMessage.objects.create(
            project=self.project,
            sender=self.customer_user,
            body="multi",
        )
        for index in range(3):
            upload = SimpleUploadedFile(
                f"part-{index}.png",
                _png_bytes(),
                content_type="image/png",
            )
            storage_path = ProjectMessageAttachmentStorageService.save_file(
                str(self.project.id),
                upload,
                ".png",
            )
            ProjectMessageAttachment.objects.create(
                message=message,
                file_name=f"part-{index}.png",
                storage_path=storage_path,
                file_size=len(_png_bytes()),
            )

        listed = self.client.get(self.customer_messages_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data["results"][0]["attachments"]), 3)
        for item in listed.data["results"][0]["attachments"]:
            self.assertNotIn("storage_path", item)
            self.assertIn("download_url", item)

    def test_body_only_json_still_works_alongside_multipart(self) -> None:
        """Attach-on-send must not break plain JSON body-only creates."""
        created = self.client.post(
            self.customer_messages_url,
            {"body": "plain text still works"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["attachments"], [])


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="http://localhost:5173",
    DEFAULT_FROM_EMAIL="noreply@3dassetmarketplace.local",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="",
)
class CustomProjectMessageEmailNotificationTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        mail.outbox.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_user = User.objects.create_user(
            email="admin-msg-mail@example.com",
            full_name="Admin Mail",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.designer = User.objects.create_user(
            email="designer-msg-mail@example.com",
            full_name="Assigned Designer",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.designer.is_staff = True
        self.designer.save(update_fields=["is_staff", "updated_at"])
        self.customer_user = User.objects.create_user(
            email="customer-msg-mail@example.com",
            full_name="Customer Mail",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Walnut desk commission",
            description="Project used to exercise message email notifications.",
        )
        self.customer_messages_url = reverse(
            "custom_projects:customer-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
        )
        self.admin_messages_url = reverse(
            "custom_projects_admin:admin-custom-project-message-list-create",
            kwargs={"project_id": self.project.id},
        )
        self.admin_login_url = reverse("accounts:admin-login")
        self.customer_login_url = reverse("accounts:login")

    def _authenticate_admin(self, user: User | None = None) -> None:
        actor = user or self.admin_user
        response = self.client.post(
            self.admin_login_url,
            {"email": actor.email, "password": self.password},
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

    def test_customer_message_emails_active_admins_when_no_designer(self) -> None:
        self._authenticate_customer()
        secret_body = "Do not leak this body or any secrets."
        created = self.client.post(
            self.customer_messages_url,
            {"body": secret_body},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertEqual(
            sorted(email.to),
            sorted([self.admin_user.email, self.designer.email]),
        )
        self.assertNotIn("noreply@3dassetmarketplace.local", email.to)
        self.assertIn("Walnut desk commission", email.subject)
        self.assertIn("Walnut desk commission", email.body)
        self.assertIn(
            f"http://localhost:5173/admin/projects/{self.project.id}",
            email.body,
        )
        self.assertNotIn(secret_body, email.body)
        self.assertNotIn(self.customer_user.email, email.body)
        self.assertNotIn("/api/", email.body)

    def test_customer_message_emails_assigned_designer_when_set(self) -> None:
        self.project.assigned_designer = self.designer
        self.project.save(update_fields=["assigned_designer", "updated_at"])
        self._authenticate_customer()
        created = self.client.post(
            self.customer_messages_url,
            {"body": "Question for the assigned designer."},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.designer.email])
        self.assertIn(
            f"http://localhost:5173/admin/projects/{self.project.id}",
            mail.outbox[0].body,
        )

    @override_settings(
        PROJECT_MESSAGE_ADMIN_RECIPIENTS=(
            "ops@3dassetmarketplace.local, desk@3dassetmarketplace.local"
        ),
    )
    def test_customer_message_uses_configured_admin_recipients(self) -> None:
        self._authenticate_customer()
        created = self.client.post(
            self.customer_messages_url,
            {"body": "Notify the ops inbox."},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            mail.outbox[0].to,
            ["ops@3dassetmarketplace.local", "desk@3dassetmarketplace.local"],
        )

    def test_admin_message_emails_project_customer(self) -> None:
        self._authenticate_admin()
        secret_body = "Internal designer note must stay off email."
        created = self.client.post(
            self.admin_messages_url,
            {"body": secret_body},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertEqual(email.to, [self.customer_user.email])
        self.assertIn("Walnut desk commission", email.subject)
        self.assertIn(
            f"http://localhost:5173/dashboard/projects/{self.project.id}",
            email.body,
        )
        self.assertNotIn(secret_body, email.body)
        self.assertNotIn(self.admin_user.email, email.body)
        self.assertNotIn("/admin/", email.body)

    def test_mail_failure_does_not_break_message_create(self) -> None:
        self._authenticate_customer()
        with patch(
            "config.mail.send_mail",
            side_effect=RuntimeError("SMTP unavailable"),
        ):
            created = self.client.post(
                self.customer_messages_url,
                {"body": "Still save me when mail breaks."},
                format="json",
            )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ProjectMessage.objects.filter(project=self.project).count(), 1)
        self.assertEqual(len(mail.outbox), 0)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_BASE_URL="http://localhost:5173",
    DEFAULT_FROM_EMAIL="noreply@3dassetmarketplace.local",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="",
)
class CustomProjectWorkflowEmailNotificationTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        mail.outbox.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_user = User.objects.create_user(
            email="admin-workflow-mail@example.com",
            full_name="Admin Workflow",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.designer = User.objects.create_user(
            email="designer-workflow-mail@example.com",
            full_name="Assigned Designer",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.designer.is_staff = True
        self.designer.save(update_fields=["is_staff", "updated_at"])
        self.customer_user = User.objects.create_user(
            email="customer-workflow-mail@example.com",
            full_name="Customer Workflow",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_login_url = reverse("accounts:admin-login")
        self.customer_login_url = reverse("accounts:login")

    def _authenticate_admin(self, user: User | None = None) -> None:
        actor = user or self.admin_user
        response = self.client.post(
            self.admin_login_url,
            {"email": actor.email, "password": self.password},
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

    def _quoted_project(self) -> CustomProject:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Oak table commission",
            description="Project used to exercise quotation workflow emails.",
            status=CustomProject.Status.UNDER_REVIEW,
            assigned_designer=self.designer,
        )
        ProjectQuotation.objects.create(
            project=project,
            amount=Decimal("350.00"),
            currency="USD",
            notes="Secret quote notes must stay off email.",
            status=ProjectQuotation.Status.PENDING,
        )
        project.status = CustomProject.Status.QUOTED
        project.save(update_fields=["status", "updated_at"])
        return project

    def test_quotation_save_emails_customer_without_quote_secrets(self) -> None:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Oak table commission",
            description="Project used to exercise quotation workflow emails.",
            status=CustomProject.Status.UNDER_REVIEW,
        )
        self._authenticate_admin()
        secret_notes = "Internal pricing strategy must never appear in email."
        quote = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation",
                kwargs={"project_id": project.id},
            ),
            {
                "amount": "350.00",
                "currency": "USD",
                "notes": secret_notes,
            },
            format="json",
        )
        self.assertEqual(quote.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertEqual(email.to, [self.customer_user.email])
        self.assertIn("Oak table commission", email.subject)
        self.assertIn("Oak table commission", email.body)
        self.assertIn(
            f"http://localhost:5173/dashboard/projects/{project.id}",
            email.body,
        )
        self.assertNotIn(secret_notes, email.body)
        self.assertNotIn("350.00", email.body)
        self.assertNotIn(self.admin_user.email, email.body)
        self.assertNotIn("/api/", email.body)
        self.assertNotIn("/admin/", email.body)

        log = OutboundEmailLog.objects.get(
            event_type="quotation_sent",
            related_object_id=str(project.id),
        )
        self.assertEqual(log.status, OutboundEmailLog.Status.SENT)
        self.assertTrue(log.recipient_hash.startswith("sha256:"))
        self.assertNotIn("@", log.recipient_hash)
        self.assertNotIn(self.customer_user.email, log.recipient_hash)

    def test_admin_resend_quotation_email_queues_second_mail(self) -> None:
        project = self._quoted_project()
        self._authenticate_admin()
        mail.outbox.clear()
        OutboundEmailLog.objects.all().delete()

        response = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation-resend-email",
                kwargs={"project_id": project.id},
            ),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.customer_user.email])
        self.assertIn("Oak table commission", mail.outbox[0].subject)

        logs = OutboundEmailLog.objects.filter(
            event_type="quotation_sent",
            related_object_id=str(project.id),
            status=OutboundEmailLog.Status.SENT,
        )
        self.assertEqual(logs.count(), 1)

        # Resend must not mutate quotation amount/notes.
        quotation = ProjectQuotation.objects.get(project_id=project.id)
        self.assertEqual(str(quotation.amount), "350.00")
        self.assertIn("Secret quote notes", quotation.notes)

    def test_admin_resend_quotation_email_requires_quotation(self) -> None:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="No quote yet",
            description="Resend should 400 without a quotation.",
            status=CustomProject.Status.UNDER_REVIEW,
        )
        self._authenticate_admin()
        response = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation-resend-email",
                kwargs={"project_id": project.id},
            ),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_resend_quotation_email(self) -> None:
        project = self._quoted_project()
        self._authenticate_customer()
        response = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation-resend-email",
                kwargs={"project_id": project.id},
            ),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_quotation_update_does_not_reemail_customer(self) -> None:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Quote revision project",
            description="Subsequent quote edits must not spam email.",
            status=CustomProject.Status.UNDER_REVIEW,
        )
        self._authenticate_admin()
        first = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation",
                kwargs={"project_id": project.id},
            ),
            {"amount": "200.00", "currency": "USD"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

        mail.outbox.clear()
        second = self.client.post(
            reverse(
                "custom_projects_admin:admin-custom-project-quotation",
                kwargs={"project_id": project.id},
            ),
            {"amount": "225.00", "currency": "USD", "notes": "Revised amount"},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)
        quotation = ProjectQuotation.objects.get(project_id=project.id)
        self.assertEqual(str(quotation.amount), "225.00")

    def test_customer_accept_quotation_emails_assigned_designer(self) -> None:
        project = self._quoted_project()
        mail.outbox.clear()
        self._authenticate_customer()
        accepted = self.client.post(
            reverse(
                "custom_projects:customer-custom-project-quotation-accept",
                kwargs={"project_id": project.id},
            ),
            {},
            format="json",
        )
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        self.assertEqual(accepted.data["status"], CustomProject.Status.APPROVED)
        self.assertEqual(accepted.data["quotation"]["status"], "accepted")
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertEqual(email.to, [self.designer.email])
        self.assertIn("Oak table commission", email.subject)
        self.assertIn(
            f"http://localhost:5173/admin/projects/{project.id}",
            email.body,
        )
        self.assertNotIn("350.00", email.body)
        self.assertNotIn(self.customer_user.email, email.body)

    def test_other_customer_cannot_accept_quotation(self) -> None:
        project = self._quoted_project()
        other = User.objects.create_user(
            email="other-workflow-mail@example.com",
            full_name="Other Workflow",
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
        response = self.client.post(
            reverse(
                "custom_projects:customer-custom-project-quotation-accept",
                kwargs={"project_id": project.id},
            ),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(len(mail.outbox), 0)

    def test_mark_delivered_emails_customer_with_deep_link(self) -> None:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Oak table commission",
            description="Project used to exercise delivery workflow emails.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        self._authenticate_admin()
        updated = self.client.patch(
            reverse(
                "custom_projects_admin:admin-custom-project-detail",
                kwargs={"project_id": project.id},
            ),
            {"status": CustomProject.Status.DELIVERED},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["status"], CustomProject.Status.DELIVERED)
        self.assertEqual(len(mail.outbox), 1)

        email = mail.outbox[0]
        self.assertEqual(email.to, [self.customer_user.email])
        self.assertIn("Oak table commission", email.subject)
        self.assertIn(
            f"http://localhost:5173/dashboard/projects/{project.id}",
            email.body,
        )
        self.assertNotIn("/api/", email.body)
        self.assertNotIn("/admin/", email.body)

    def test_mail_failure_does_not_break_quotation_accept_or_delivery(self) -> None:
        project = self._quoted_project()
        self._authenticate_customer()
        with patch(
            "config.mail.send_mail",
            side_effect=RuntimeError("SMTP unavailable"),
        ):
            accepted = self.client.post(
                reverse(
                    "custom_projects:customer-custom-project-quotation-accept",
                    kwargs={"project_id": project.id},
                ),
                {},
                format="json",
            )
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        project.refresh_from_db()
        self.assertEqual(project.status, CustomProject.Status.APPROVED)
        self.assertEqual(project.quotation.status, ProjectQuotation.Status.ACCEPTED)

        project.status = CustomProject.Status.IN_PROGRESS
        project.save(update_fields=["status", "updated_at"])
        self._authenticate_admin()
        with patch(
            "config.mail.send_mail",
            side_effect=RuntimeError("SMTP unavailable"),
        ):
            delivered = self.client.patch(
                reverse(
                    "custom_projects_admin:admin-custom-project-detail",
                    kwargs={"project_id": project.id},
                ),
                {"status": CustomProject.Status.DELIVERED},
                format="json",
            )
        self.assertEqual(delivered.status_code, status.HTTP_200_OK)
        project.refresh_from_db()
        self.assertEqual(project.status, CustomProject.Status.DELIVERED)
        self.assertEqual(len(mail.outbox), 0)

    def test_mail_failure_does_not_break_quotation_save(self) -> None:
        project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Mail failure quote project",
            description="Quotation must persist when email sending fails.",
            status=CustomProject.Status.UNDER_REVIEW,
        )
        self._authenticate_admin()
        with patch(
            "config.mail.send_mail",
            side_effect=RuntimeError("SMTP unavailable"),
        ):
            quote = self.client.post(
                reverse(
                    "custom_projects_admin:admin-custom-project-quotation",
                    kwargs={"project_id": project.id},
                ),
                {"amount": "120.00", "currency": "USD"},
                format="json",
            )
        self.assertEqual(quote.status_code, status.HTTP_200_OK)
        self.assertTrue(ProjectQuotation.objects.filter(project_id=project.id).exists())
        self.assertEqual(len(mail.outbox), 0)


class ProjectDeliveryModelTests(APITestCase):
    def setUp(self) -> None:
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="delivery-customer@example.com",
            full_name="Delivery Customer",
            password="StrongPass123!",
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="delivery-admin@example.com",
            full_name="Delivery Admin",
            password="StrongPass123!",
            role=self.admin_role,
            email_verified=True,
        )
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Delivery test project",
            description="Needs a deliverable upload.",
        )

    def test_delivery_can_be_created_with_version(self) -> None:
        delivery = ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="chair_v1.glb",
            storage_path="http://localhost/media/custom_projects/deliveries/chair_v1.glb",
            file_size=2048,
            version=1,
            notes="First delivery pass.",
        )
        self.assertEqual(delivery.project_id, self.project.id)
        self.assertEqual(delivery.version, 1)
        self.assertEqual(str(delivery), "chair_v1.glb (v1)")

    def test_duplicate_version_per_project_is_rejected(self) -> None:
        ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="chair_v1.glb",
            storage_path="http://localhost/media/custom_projects/deliveries/chair_v1.glb",
            file_size=2048,
            version=1,
        )
        with self.assertRaises(IntegrityError):
            ProjectDelivery.objects.create(
                project=self.project,
                uploaded_by=self.admin_user,
                file_name="chair_v1_revised.glb",
                storage_path="http://localhost/media/custom_projects/deliveries/chair_v1_revised.glb",
                file_size=4096,
                version=1,
            )

    def test_project_file_model_unchanged(self) -> None:
        from custom_projects.models import ProjectFile

        self.assertIn("file_type", [field.name for field in ProjectFile._meta.get_fields()])
        self.assertNotIn(
            "version",
            [field.name for field in ProjectFile._meta.get_fields()],
        )


class ProjectDeliveryRiskScenarioTests(APITestCase):
    """Regression coverage for delivery admin/version/storage_path edge cases."""

    def setUp(self) -> None:
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="delivery-risk-customer@example.com",
            full_name="Delivery Risk Customer",
            password="StrongPass123!",
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="delivery-risk-admin@example.com",
            full_name="Delivery Risk Admin",
            password="StrongPass123!",
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.is_superuser = True
        self.admin_user.save(update_fields=["is_staff", "is_superuser", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Delivery risk project",
            description="Risk scenario coverage.",
        )

    def test_admin_add_requires_storage_path_then_locks_on_change(self) -> None:
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory

        from custom_projects.admin import ProjectDeliveryAdmin

        model_admin = ProjectDeliveryAdmin(ProjectDelivery, AdminSite())
        request = RequestFactory().get("/admin/custom_projects/projectdelivery/add/")
        request.user = self.admin_user
        readonly_on_add = model_admin.get_readonly_fields(request, obj=None)
        form_class = model_admin.get_form(request, obj=None)

        missing_path = form_class(
            data={
                "project": str(self.project.id),
                "uploaded_by": str(self.admin_user.id),
                "file_name": "chair.glb",
                "file_size": "100",
                "version": "1",
                "notes": "admin create attempt",
            }
        )
        with_path = form_class(
            data={
                "project": str(self.project.id),
                "uploaded_by": str(self.admin_user.id),
                "file_name": "chair.glb",
                "storage_path": "http://localhost/media/custom_projects/deliveries/chair.glb",
                "file_size": "100",
                "version": "1",
                "notes": "admin create attempt",
            }
        )
        self.assertNotIn("storage_path", readonly_on_add)
        self.assertIn("storage_path", missing_path.fields)
        self.assertFalse(missing_path.is_valid())
        self.assertIn("storage_path", missing_path.errors)
        self.assertTrue(with_path.is_valid())
        saved = with_path.save()
        self.assertTrue(bool(saved.storage_path))
        readonly_on_change = model_admin.get_readonly_fields(request, obj=saved)
        self.assertIn("storage_path", readonly_on_change)

    def test_version_zero_is_rejected(self) -> None:
        from django.core.exceptions import ValidationError

        delivery = ProjectDelivery(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="zero.glb",
            storage_path="http://localhost/media/custom_projects/deliveries/zero.glb",
            file_size=1,
            version=0,
        )
        with self.assertRaises(ValidationError) as ctx:
            delivery.full_clean()
        self.assertIn("version", ctx.exception.message_dict)

    def test_duplicate_version_admin_form_surfaces_error_not_crash(self) -> None:
        from django.contrib.admin.sites import AdminSite
        from django.test import RequestFactory

        from custom_projects.admin import ProjectDeliveryAdmin

        ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="first.glb",
            storage_path="http://localhost/media/custom_projects/deliveries/first.glb",
            file_size=10,
            version=1,
        )
        model_admin = ProjectDeliveryAdmin(ProjectDelivery, AdminSite())
        request = RequestFactory().post("/admin/custom_projects/projectdelivery/add/")
        request.user = self.admin_user
        form_class = model_admin.get_form(request, obj=None)
        form = form_class(
            data={
                "project": str(self.project.id),
                "uploaded_by": str(self.admin_user.id),
                "file_name": "second.glb",
                "storage_path": "http://localhost/media/custom_projects/deliveries/second.glb",
                "file_size": "20",
                "version": "1",
                "notes": "",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertTrue(form.errors)

    def test_invalid_storage_path_validates_cleanly(self) -> None:
        from django.core.exceptions import ValidationError

        delivery = ProjectDelivery(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="bad.glb",
            storage_path="../secret.zip",
            file_size=1,
            version=3,
        )
        with self.assertRaises(ValidationError) as ctx:
            delivery.full_clean()
        self.assertIn("storage_path", ctx.exception.message_dict)

    def test_version_display_label_for_integer_versions(self) -> None:
        labels = []
        for version in (1, 2, 99):
            delivery = ProjectDelivery.objects.create(
                project=self.project,
                uploaded_by=self.admin_user,
                file_name=f"file_v{version}.glb",
                storage_path=(
                    f"http://localhost/media/custom_projects/deliveries/file_v{version}.glb"
                ),
                file_size=version,
                version=version,
            )
            labels.append(str(delivery))
        self.assertEqual(
            labels,
            ["file_v1.glb (v1)", "file_v2.glb (v2)", "file_v99.glb (v99)"],
        )


class ProjectDeliveryUploadAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="delivery-upload-customer@example.com",
            full_name="Delivery Upload Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="delivery-upload-admin@example.com",
            full_name="Delivery Upload Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Delivery upload project",
            description="Needs admin deliverable upload.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        self.upload_url = reverse(
            "custom_projects_admin:admin-custom-project-delivery-list-create",
            kwargs={"project_id": self.project.id},
        )

    def _authenticate_admin(self) -> None:
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _authenticate_customer(self) -> None:
        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    @staticmethod
    def _zip_upload(name: str = "package.zip") -> SimpleUploadedFile:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF")
        return SimpleUploadedFile(
            name,
            buffer.getvalue(),
            content_type="application/zip",
        )

    def test_admin_can_upload_delivery_with_auto_version(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.upload_url,
            {"file": self._zip_upload("package.zip"), "notes": "First package"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["file_name"], "package.zip")
        self.assertEqual(response.data["version"], 1)
        self.assertEqual(response.data["notes"], "First package")
        self.assertNotIn("storage_path", response.data)
        self.assertEqual(self.project.deliveries.count(), 1)
        delivery = self.project.deliveries.get()
        self.assertTrue(
            delivery.storage_path.startswith("custom_projects/deliveries/")
        )

    def test_admin_can_set_explicit_version(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.upload_url,
            {
                "file": self._zip_upload("rev2.zip"),
                "version": 3,
                "notes": "Skip to v3",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["version"], 3)
        self.assertNotIn("storage_path", response.data)

    def test_duplicate_version_is_rejected(self) -> None:
        self._authenticate_admin()
        first = self.client.post(
            self.upload_url,
            {"file": self._zip_upload("a.zip"), "version": 2},
            format="multipart",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post(
            self.upload_url,
            {"file": self._zip_upload("b.zip"), "version": 2},
            format="multipart",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("version", second.data)

    def test_rejects_invalid_extension(self) -> None:
        self._authenticate_admin()
        upload = SimpleUploadedFile(
            "malware.exe",
            b"MZ",
            content_type="application/octet-stream",
        )
        response = self.client.post(
            self.upload_url,
            {"file": upload},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_upload_via_admin_endpoint(self) -> None:
        self._authenticate_customer()
        response = self.client.post(
            self.upload_url,
            {
                "file": SimpleUploadedFile(
                    "ref.png", _png_bytes(), content_type="image/png"
                )
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.project.deliveries.count(), 0)

    def test_customer_cannot_upload_via_customer_deliveries_route(self) -> None:
        self._authenticate_customer()
        response = self.client.post(
            reverse(
                "custom_projects:customer-custom-project-delivery-list",
                kwargs={"project_id": self.project.id},
            ),
            {
                "file": SimpleUploadedFile(
                    "ref.png", _png_bytes(), content_type="image/png"
                )
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(self.project.deliveries.count(), 0)

    def test_unauthenticated_upload_is_rejected(self) -> None:
        response = self.client.post(
            self.upload_url,
            {
                "file": SimpleUploadedFile(
                    "ref.png", _png_bytes(), content_type="image/png"
                )
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_private_delivery_media_path_is_blocked(self) -> None:
        self._authenticate_admin()
        created = self.client.post(
            self.upload_url,
            {"file": self._zip_upload("private.zip")},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        delivery = ProjectDelivery.objects.get(pk=created.data["id"])
        relative = media_relative_path(delivery.storage_path)
        self.client.credentials()
        public = self.client.get(f"/media/{relative}")
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)

    def test_auto_version_increments_after_existing(self) -> None:
        ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="existing.zip",
            storage_path="http://localhost/media/custom_projects/deliveries/existing.zip",
            file_size=10,
            version=5,
        )
        self._authenticate_admin()
        response = self.client.post(
            self.upload_url,
            {"file": self._zip_upload("next.zip")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["version"], 6)
        self.assertNotIn("storage_path", response.data)


class ProjectDeliveryCrashRiskScenarioTests(APITestCase):
    """Real-world crash scenarios for delivery upload assumptions."""

    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="delivery-crash-customer@example.com",
            full_name="Delivery Crash Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="delivery-crash-admin@example.com",
            full_name="Delivery Crash Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Delivery crash scenarios",
            description="Probe real-world upload failure modes.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        self.upload_url = reverse(
            "custom_projects_admin:admin-custom-project-delivery-list-create",
            kwargs={"project_id": self.project.id},
        )
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _assert_not_crash(self, response, *, allowed=(400, 401, 403, 404)) -> None:
        self.assertNotEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            msg=f"Unexpected crash: {response.status_code} {getattr(response, 'data', None)}",
        )
        self.assertIn(response.status_code, (*allowed, 201))

    def test_glb_deliverable_does_not_crash(self) -> None:
        """Hypothesis A: real 3D deliverable format must not 500."""
        upload = SimpleUploadedFile(
            "chair.glb",
            b"glTF" + b"\x00" * 64,
            content_type="model/gltf-binary",
        )
        response = self.client.post(
            self.upload_url,
            {"file": upload, "notes": "Final GLB package"},
            format="multipart",
        )
        self._assert_not_crash(response, allowed=(400,))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_fbx_and_obj_deliverables_do_not_crash(self) -> None:
        """Hypothesis A: common CAD export formats must not 500."""
        for name, mime in (
            ("model.fbx", "application/octet-stream"),
            ("mesh.obj", "text/plain"),
            ("scene.blend", "application/octet-stream"),
        ):
            with self.subTest(name=name):
                upload = SimpleUploadedFile(name, b"binary-asset-bytes", content_type=mime)
                response = self.client.post(
                    self.upload_url,
                    {"file": upload},
                    format="multipart",
                )
                self._assert_not_crash(response, allowed=(400,))
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_file_and_empty_multipart_do_not_crash(self) -> None:
        """Hypothesis B: incomplete multipart payloads must not 500."""
        missing = self.client.post(
            self.upload_url,
            {"notes": "no file attached"},
            format="multipart",
        )
        self._assert_not_crash(missing, allowed=(400,))
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)

        empty_file = SimpleUploadedFile("empty.zip", b"", content_type="application/zip")
        empty = self.client.post(
            self.upload_url,
            {"file": empty_file},
            format="multipart",
        )
        self._assert_not_crash(empty, allowed=(400,))
        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST)

    def test_malformed_version_does_not_crash(self) -> None:
        """Hypothesis B: non-integer version must not 500."""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF")
        upload = SimpleUploadedFile(
            "ok.zip",
            buffer.getvalue(),
            content_type="application/zip",
        )
        response = self.client.post(
            self.upload_url,
            {"file": upload, "version": "not-a-number"},
            format="multipart",
        )
        self._assert_not_crash(response, allowed=(400,))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unicode_and_large_notes_do_not_crash(self) -> None:
        """Hypothesis C: unicode / large notes must not 500."""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF")
        upload = SimpleUploadedFile(
            "notes.zip",
            buffer.getvalue(),
            content_type="application/zip",
        )
        notes = "交付文件 v1 — café 🚀 " + ("x" * 20_000)
        response = self.client.post(
            self.upload_url,
            {"file": upload, "notes": notes},
            format="multipart",
        )
        self._assert_not_crash(response, allowed=(201,))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("storage_path", response.data)

    def test_duplicate_version_path_stays_stable(self) -> None:
        """Hypothesis D: IntegrityError path returns 400, not 500."""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF")
        payload = buffer.getvalue()
        first = self.client.post(
            self.upload_url,
            {
                "file": SimpleUploadedFile(
                    "a.zip", payload, content_type="application/zip"
                ),
                "version": 7,
            },
            format="multipart",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post(
            self.upload_url,
            {
                "file": SimpleUploadedFile(
                    "b.zip", payload, content_type="application/zip"
                ),
                "version": 7,
            },
            format="multipart",
        )
        self._assert_not_crash(second, allowed=(400,))
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("version", second.data)

    def test_valid_zip_then_private_media_access_does_not_crash(self) -> None:
        """Hypothesis E: success response omits storage_path; public media stays 404."""
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF")
        created = self.client.post(
            self.upload_url,
            {
                "file": SimpleUploadedFile(
                    "final.zip", buffer.getvalue(), content_type="application/zip"
                )
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("storage_path", created.data)
        delivery = ProjectDelivery.objects.get(pk=created.data["id"])
        relative = media_relative_path(delivery.storage_path)
        self.client.credentials()
        public = self.client.get(f"/media/{relative}")
        self._assert_not_crash(public, allowed=(404,))
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)


class ProjectDeliveryListDownloadAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="delivery-list-customer@example.com",
            full_name="Delivery List Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="delivery-list-other@example.com",
            full_name="Delivery List Other",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="delivery-list-admin@example.com",
            full_name="Delivery List Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Delivery list project",
            description="Needs list and download coverage.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        self.admin_list_url = reverse(
            "custom_projects_admin:admin-custom-project-delivery-list-create",
            kwargs={"project_id": self.project.id},
        )
        self.customer_list_url = reverse(
            "custom_projects:customer-custom-project-delivery-list",
            kwargs={"project_id": self.project.id},
        )

    def _authenticate_admin(self) -> None:
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _authenticate_customer(self, user: User | None = None) -> None:
        account = user or self.customer_user
        login = self.client.post(
            reverse("accounts:login"),
            {"email": account.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _create_stored_delivery(self, *, version: int, name: str) -> ProjectDelivery:
        self._authenticate_admin()
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("asset.glb", b"glTF")
        response = self.client.post(
            self.admin_list_url,
            {
                "file": SimpleUploadedFile(
                    name, buffer.getvalue(), content_type="application/zip"
                ),
                "version": version,
                "notes": f"v{version}",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return ProjectDelivery.objects.get(pk=response.data["id"])

    def test_admin_can_list_deliveries_with_download_url(self) -> None:
        first = self._create_stored_delivery(version=1, name="v1.zip")
        second = self._create_stored_delivery(version=2, name="v2.zip")
        self._authenticate_admin()
        response = self.client.get(self.admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        results = response.data["results"]
        self.assertEqual(results[0]["id"], str(second.id))
        self.assertEqual(results[1]["id"], str(first.id))
        for item in results:
            self.assertNotIn("storage_path", item)
            self.assertIn("download_url", item)
            self.assertIn("/api/v1/admin/custom-projects/", item["download_url"])
            self.assertIn("/deliveries/", item["download_url"])
            self.assertIn("/download/", item["download_url"])

    def test_owner_can_list_deliveries_with_customer_download_url(self) -> None:
        delivery = self._create_stored_delivery(version=1, name="owner.zip")
        self._authenticate_customer()
        response = self.client.get(self.customer_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        item = response.data["results"][0]
        self.assertEqual(item["id"], str(delivery.id))
        self.assertNotIn("storage_path", item)
        self.assertIn("/api/v1/custom-projects/", item["download_url"])
        self.assertIn(f"/deliveries/{delivery.id}/download/", item["download_url"])

    def test_other_customer_cannot_list_deliveries(self) -> None:
        self._create_stored_delivery(version=1, name="hidden.zip")
        self._authenticate_customer(self.other_customer)
        response = self.client.get(self.customer_list_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_cannot_list_via_admin_endpoint(self) -> None:
        self._create_stored_delivery(version=1, name="admin-only.zip")
        self._authenticate_customer()
        response = self.client.get(self.admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_list_is_rejected(self) -> None:
        response = self.client.get(self.admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        customer = self.client.get(self.customer_list_url)
        self.assertEqual(customer.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_and_owner_can_download_other_customer_cannot(self) -> None:
        delivery = self._create_stored_delivery(version=1, name="dl.zip")
        admin_download = reverse(
            "custom_projects_admin:admin-custom-project-delivery-download",
            kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
        )
        customer_download = reverse(
            "custom_projects:customer-custom-project-delivery-download",
            kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
        )

        self._authenticate_admin()
        admin_response = self.client.get(admin_download)
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        self.assertTrue(admin_response.get("Content-Disposition", "").startswith("attachment"))

        self._authenticate_customer()
        owner_response = self.client.get(customer_download)
        self.assertEqual(owner_response.status_code, status.HTTP_200_OK)
        self.assertTrue(owner_response.get("Content-Disposition", "").startswith("attachment"))

        self._authenticate_customer(self.other_customer)
        other_response = self.client.get(customer_download)
        self.assertEqual(other_response.status_code, status.HTTP_404_NOT_FOUND)

        self._authenticate_customer()
        forbidden_admin = self.client.get(admin_download)
        self.assertEqual(forbidden_admin.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_delivery_download_returns_404(self) -> None:
        self._authenticate_admin()
        missing = self.client.get(
            reverse(
                "custom_projects_admin:admin-custom-project-delivery-download",
                kwargs={
                    "project_id": self.project.id,
                    "delivery_id": "00000000-0000-0000-0000-000000000099",
                },
            )
        )
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_storage_file_download_returns_404_not_500(self) -> None:
        delivery = ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="ghost.zip",
            storage_path=(
                "http://localhost/media/custom_projects/deliveries/"
                f"{self.project.id}/missing-ghost.zip"
            ),
            file_size=12,
            version=9,
        )
        self._authenticate_admin()
        response = self.client.get(
            reverse(
                "custom_projects_admin:admin-custom-project-delivery-download",
                kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(R2_ENABLED=True, R2_SIGNED_URL_EXPIRY=300)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_delivery_download_returns_signed_json_when_r2_has_object(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        delivery = self._create_stored_delivery(version=1, name="signed-dl.zip")
        mock_get_private_storage.return_value.exists.return_value = True
        mock_presign.return_value = (
            "https://acc.r2.cloudflarestorage.com/3dam-private/"
            "custom_projects/deliveries/pack.zip?X-Amz-Signature=test"
        )
        customer_download = reverse(
            "custom_projects:customer-custom-project-delivery-download",
            kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
        )
        self._authenticate_customer()
        response = self.client.get(customer_download)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["download_url"], mock_presign.return_value)
        self.assertEqual(response.data["expires_in"], 300)
        self.assertEqual(response.data["file_name"], delivery.file_name)
        self.assertNotIn("storage_path", response.data)
        mock_presign.assert_called_once()

    @override_settings(R2_ENABLED=True)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_delivery_download_falls_back_to_stream_when_r2_misses(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        delivery = self._create_stored_delivery(version=1, name="local-fallback.zip")
        mock_get_private_storage.return_value.exists.return_value = False
        admin_download = reverse(
            "custom_projects_admin:admin-custom-project-delivery-download",
            kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
        )
        self._authenticate_admin()
        response = self.client.get(admin_download)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.get("Content-Disposition", "").startswith("attachment"))
        content = b"".join(response.streaming_content)
        self.assertIn(b"PK", content)
        mock_presign.assert_not_called()

    def test_private_media_still_blocked_after_authenticated_download(self) -> None:
        delivery = self._create_stored_delivery(version=1, name="private-dl.zip")
        relative = media_relative_path(delivery.storage_path)
        self._authenticate_admin()
        ok = self.client.get(
            reverse(
                "custom_projects_admin:admin-custom-project-delivery-download",
                kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
            )
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.client.credentials()
        public = self.client.get(f"/media/{relative}")
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)


class ProjectDeliveryListDownloadCrashRiskScenarioTests(APITestCase):
    """Real-world crash scenarios for list/download ACL and storage assumptions."""

    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="delivery-ld-crash-customer@example.com",
            full_name="Delivery LD Crash Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="delivery-ld-crash-other@example.com",
            full_name="Delivery LD Crash Other",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="delivery-ld-crash-admin@example.com",
            full_name="Delivery LD Crash Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Delivery list/download crash project",
            description="Probe ACL and download crash modes.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        self.other_project = CustomProject.objects.create(
            customer=self.other_customer,
            title="Other delivery crash project",
            description="Cross-project delivery ID probe.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        self.admin_list_url = reverse(
            "custom_projects_admin:admin-custom-project-delivery-list-create",
            kwargs={"project_id": self.project.id},
        )
        self.customer_list_url = reverse(
            "custom_projects:customer-custom-project-delivery-list",
            kwargs={"project_id": self.project.id},
        )

    def _authenticate_admin(self) -> None:
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _authenticate_customer(self, user: User | None = None) -> None:
        account = user or self.customer_user
        login = self.client.post(
            reverse("accounts:login"),
            {"email": account.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _assert_not_crash(self, response, *, allowed=(400, 401, 403, 404, 405)) -> None:
        self.assertNotEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            msg=f"Unexpected crash: {response.status_code} {getattr(response, 'data', None)}",
        )
        self.assertIn(response.status_code, (*allowed, 200, 201))

    def _create_zip_delivery(self, *, project: CustomProject, version: int) -> ProjectDelivery:
        self._authenticate_admin()
        upload_url = reverse(
            "custom_projects_admin:admin-custom-project-delivery-list-create",
            kwargs={"project_id": project.id},
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("asset.glb", b"glTF")
        response = self.client.post(
            upload_url,
            {
                "file": SimpleUploadedFile(
                    f"v{version}.zip",
                    buffer.getvalue(),
                    content_type="application/zip",
                ),
                "version": version,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return ProjectDelivery.objects.get(pk=response.data["id"])

    def test_cross_project_delivery_id_does_not_crash(self) -> None:
        """Hypothesis A: delivery from another project must 404, not 500."""
        foreign = self._create_zip_delivery(project=self.other_project, version=1)
        self._authenticate_admin()
        admin_resp = self.client.get(
            reverse(
                "custom_projects_admin:admin-custom-project-delivery-download",
                kwargs={
                    "project_id": self.project.id,
                    "delivery_id": foreign.id,
                },
            )
        )
        self._assert_not_crash(admin_resp, allowed=(404,))
        self.assertEqual(admin_resp.status_code, status.HTTP_404_NOT_FOUND)

        self._authenticate_customer()
        owner_resp = self.client.get(
            reverse(
                "custom_projects:customer-custom-project-delivery-download",
                kwargs={
                    "project_id": self.project.id,
                    "delivery_id": foreign.id,
                },
            )
        )
        self._assert_not_crash(owner_resp, allowed=(404,))
        self.assertEqual(owner_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_malformed_storage_paths_do_not_crash(self) -> None:
        """Hypothesis B: traversal/empty/absolute storage_path must 404, not 500."""
        paths = (
            "",
            "../etc/passwd",
            "http://localhost/media/../secret.zip",
            r"C:\Windows\System32\drivers\etc\hosts",
            "/etc/passwd",
            "custom_projects/deliveries/../../settings.py",
        )
        self._authenticate_admin()
        for index, storage_path in enumerate(paths, start=1):
            with self.subTest(storage_path=storage_path):
                delivery = ProjectDelivery.objects.create(
                    project=self.project,
                    uploaded_by=self.admin_user,
                    file_name=f"bad-{index}.zip",
                    storage_path=storage_path,
                    file_size=1,
                    version=100 + index,
                )
                response = self.client.get(
                    reverse(
                        "custom_projects_admin:admin-custom-project-delivery-download",
                        kwargs={
                            "project_id": self.project.id,
                            "delivery_id": delivery.id,
                        },
                    )
                )
                self._assert_not_crash(response, allowed=(404,))
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_write_methods_on_list_do_not_crash(self) -> None:
        """Hypothesis C: customer POST/PUT/PATCH/DELETE must not 500."""
        self._authenticate_customer()
        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.customer_list_url)
                self._assert_not_crash(response, allowed=(405,))
                self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_pagination_abuse_does_not_crash(self) -> None:
        """Hypothesis D: extreme page params must not 500."""
        self._create_zip_delivery(project=self.project, version=1)
        self._authenticate_admin()
        cases = (
            {"page": "0"},
            {"page": "-1"},
            {"page_size": "0"},
            {"page_size": "-5"},
            {"page_size": "999999"},
            {"page": "abc", "page_size": "xyz"},
        )
        for params in cases:
            with self.subTest(params=params):
                response = self.client.get(self.admin_list_url, params)
                self._assert_not_crash(response, allowed=(200, 404))
                self.assertNotEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

        self._authenticate_customer()
        for params in cases:
            with self.subTest(scope="customer", params=params):
                response = self.client.get(self.customer_list_url, params)
                self._assert_not_crash(response, allowed=(200, 404))

    def test_unknown_project_and_other_owner_do_not_crash(self) -> None:
        """Hypothesis E: unknown project / other customer must 404, not 500."""
        unknown = "00000000-0000-0000-0000-000000000077"
        self._authenticate_admin()
        admin_list = self.client.get(f"/api/v1/admin/custom-projects/{unknown}/deliveries/")
        self._assert_not_crash(admin_list, allowed=(404,))
        self.assertEqual(admin_list.status_code, status.HTTP_404_NOT_FOUND)

        self._authenticate_customer(self.other_customer)
        other_list = self.client.get(self.customer_list_url)
        self._assert_not_crash(other_list, allowed=(404,))
        self.assertEqual(other_list.status_code, status.HTTP_404_NOT_FOUND)

        delivery = self._create_zip_delivery(project=self.project, version=2)
        self._authenticate_customer(self.other_customer)
        other_dl = self.client.get(
            reverse(
                "custom_projects:customer-custom-project-delivery-download",
                kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
            )
        )
        self._assert_not_crash(other_dl, allowed=(404,))
        self.assertEqual(other_dl.status_code, status.HTTP_404_NOT_FOUND)

    def test_deleted_disk_file_and_private_media_do_not_crash(self) -> None:
        """Hypothesis B/E: missing on-disk file and direct media URL must not 500."""
        delivery = self._create_zip_delivery(project=self.project, version=3)
        relative = media_relative_path(delivery.storage_path)
        self.assertIsNotNone(relative)
        from django.core.files.storage import default_storage

        if default_storage.exists(relative):
            default_storage.delete(relative)

        self._authenticate_admin()
        missing = self.client.get(
            reverse(
                "custom_projects_admin:admin-custom-project-delivery-download",
                kwargs={"project_id": self.project.id, "delivery_id": delivery.id},
            )
        )
        self._assert_not_crash(missing, allowed=(404,))
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

        self.client.credentials()
        public = self.client.get(f"/media/{relative}")
        self._assert_not_crash(public, allowed=(404,))
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)


class ProjectDeliveryStatusMarkCrashRiskScenarioTests(APITestCase):
    """Real-world crash scenarios for Mark delivered / Mark completed transitions."""

    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="delivery-status-crash-customer@example.com",
            full_name="Delivery Status Crash Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="delivery-status-crash-admin@example.com",
            full_name="Delivery Status Crash Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Status mark crash project",
            description="Probe mark delivered/completed crash modes.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        self.detail_url = reverse(
            "custom_projects_admin:admin-custom-project-detail",
            kwargs={"project_id": self.project.id},
        )
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _assert_not_crash(self, response, *, allowed=(400, 401, 403, 404, 200)) -> None:
        self.assertNotEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            msg=f"Unexpected crash: {response.status_code} {getattr(response, 'data', None)}",
        )
        self.assertIn(response.status_code, allowed)

    def _patch_status(self, next_status: str):
        return self.client.patch(
            self.detail_url,
            {"status": next_status},
            format="json",
        )

    def test_illegal_transitions_do_not_crash(self) -> None:
        """Hypothesis A: illegal mark paths must 400, never 500."""
        self.project.status = CustomProject.Status.SUBMITTED
        self.project.save(update_fields=["status", "updated_at"])

        for next_status in (
            CustomProject.Status.DELIVERED,
            CustomProject.Status.COMPLETED,
        ):
            with self.subTest(from_status="submitted", to_status=next_status):
                response = self._patch_status(next_status)
                self._assert_not_crash(response, allowed=(400,))
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("status", response.data)

        self.project.status = CustomProject.Status.IN_PROGRESS
        self.project.save(update_fields=["status", "updated_at"])
        skip = self._patch_status(CustomProject.Status.COMPLETED)
        self._assert_not_crash(skip, allowed=(400,))
        self.assertEqual(skip.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mark_delivered_with_zero_files_does_not_crash(self) -> None:
        """Hypothesis B: mark delivered without uploads must not 500."""
        self.assertEqual(self.project.deliveries.count(), 0)
        response = self._patch_status(CustomProject.Status.DELIVERED)
        self._assert_not_crash(response, allowed=(200,))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], CustomProject.Status.DELIVERED)

    def test_happy_path_delivered_then_completed_does_not_crash(self) -> None:
        """Hypothesis C: in_progress → delivered → completed must succeed."""
        delivered = self._patch_status(CustomProject.Status.DELIVERED)
        self._assert_not_crash(delivered, allowed=(200,))
        self.assertEqual(delivered.data["status"], CustomProject.Status.DELIVERED)

        # At least one delivery is required before marking completed.
        ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="final.zip",
            storage_path="http://localhost/media/custom_projects/deliveries/final.zip",
            file_size=512,
            version=1,
        )

        completed = self._patch_status(CustomProject.Status.COMPLETED)
        self._assert_not_crash(completed, allowed=(200,))
        self.assertEqual(completed.data["status"], CustomProject.Status.COMPLETED)

        again = self._patch_status(CustomProject.Status.COMPLETED)
        self._assert_not_crash(again, allowed=(200,))
        self.assertEqual(again.data["status"], CustomProject.Status.COMPLETED)

    def test_same_status_and_back_transition_do_not_crash(self) -> None:
        """Hypothesis D: delivered→delivered no-op; delivered→in_progress allowed."""
        self.project.status = CustomProject.Status.DELIVERED
        self.project.save(update_fields=["status", "updated_at"])

        same = self._patch_status(CustomProject.Status.DELIVERED)
        self._assert_not_crash(same, allowed=(200,))
        self.assertEqual(same.status_code, status.HTTP_200_OK)

        back = self._patch_status(CustomProject.Status.IN_PROGRESS)
        self._assert_not_crash(back, allowed=(200,))
        self.assertEqual(back.data["status"], CustomProject.Status.IN_PROGRESS)

    def test_error_payload_shape_is_field_keyed(self) -> None:
        """Hypothesis E: clients receive status field errors, not opaque 500."""
        self.project.status = CustomProject.Status.SUBMITTED
        self.project.save(update_fields=["status", "updated_at"])
        response = self._patch_status(CustomProject.Status.DELIVERED)
        self._assert_not_crash(response, allowed=(400,))
        self.assertIsInstance(response.data.get("status"), list)
        self.assertTrue(response.data["status"])


class ProjectCompletionGuardTests(APITestCase):
    """Tests for the delivery-required guard on status=completed transitions."""

    def setUp(self) -> None:
        cache.clear()
        mail.outbox.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="completion-guard-customer@example.com",
            full_name="Completion Guard Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="completion-guard-admin@example.com",
            full_name="Completion Guard Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Completion guard project",
            description="Testing completion guard rules.",
            status=CustomProject.Status.DELIVERED,
        )
        self.detail_url = reverse(
            "custom_projects_admin:admin-custom-project-detail",
            kwargs={"project_id": self.project.id},
        )
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _patch_status(self, next_status: str):
        return self.client.patch(
            self.detail_url,
            {"status": next_status},
            format="json",
        )

    def _make_delivery(self) -> ProjectDelivery:
        return ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin_user,
            file_name="delivery.zip",
            storage_path="http://localhost/media/custom_projects/deliveries/delivery.zip",
            file_size=1024,
            version=1,
        )

    def test_complete_without_deliveries_is_rejected(self) -> None:
        """Marking completed without any delivery must return 400."""
        self.assertEqual(self.project.deliveries.count(), 0)
        response = self._patch_status(CustomProject.Status.COMPLETED)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, CustomProject.Status.DELIVERED)

    def test_complete_with_delivery_succeeds(self) -> None:
        """Marking completed with at least one delivery must succeed."""
        self._make_delivery()
        response = self._patch_status(CustomProject.Status.COMPLETED)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], CustomProject.Status.COMPLETED)

    def test_completed_to_in_progress_rejected(self) -> None:
        """completed is a terminal state; back-transitions must 400."""
        self._make_delivery()
        self._patch_status(CustomProject.Status.COMPLETED)
        response = self._patch_status(CustomProject.Status.IN_PROGRESS)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)

    def test_rejected_to_submitted_rejected(self) -> None:
        """rejected is terminal; forward-transition must 400."""
        self.project.status = CustomProject.Status.REJECTED
        self.project.save(update_fields=["status", "updated_at"])
        response = self._patch_status(CustomProject.Status.SUBMITTED)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancelled_to_in_progress_rejected(self) -> None:
        """cancelled is terminal; any forward-transition must 400."""
        self.project.status = CustomProject.Status.CANCELLED
        self.project.save(update_fields=["status", "updated_at"])
        response = self._patch_status(CustomProject.Status.IN_PROGRESS)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_completion_email_sent_to_customer(self) -> None:
        """Completing a project must send an email to the customer."""
        self._make_delivery()
        mail.outbox.clear()
        response = self._patch_status(CustomProject.Status.COMPLETED)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn(self.customer_user.email, sent.to)
        self.assertIn(self.project.title, sent.subject)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_completion_email_not_sent_if_already_completed(self) -> None:
        """Re-saving a project that is already completed must not re-send the email."""
        self._make_delivery()
        self._patch_status(CustomProject.Status.COMPLETED)
        mail.outbox.clear()
        # second PATCH with same status — no-op; previous_status == COMPLETED
        self._patch_status(CustomProject.Status.COMPLETED)
        self.assertEqual(len(mail.outbox), 0)


class ReferenceFileDeleteTests(APITestCase):
    """Tests for DELETE /api/v1/custom-projects/<id>/files/<file_id>/."""

    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_user = User.objects.create_user(
            email="reffile-delete-customer@example.com",
            full_name="RefFile Delete Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="reffile-delete-other@example.com",
            full_name="RefFile Delete Other",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_user = User.objects.create_user(
            email="reffile-delete-admin@example.com",
            full_name="RefFile Delete Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.project = CustomProject.objects.create(
            customer=self.customer_user,
            title="Ref file delete project",
            description="Testing reference file deletion.",
            status=CustomProject.Status.SUBMITTED,
        )
        from custom_projects.models import ProjectFile
        self.project_file = ProjectFile.objects.create(
            project=self.project,
            uploaded_by=self.customer_user,
            file_type=ProjectFile.FileType.OTHER,
            file_name="ref.png",
            storage_path="http://localhost/media/custom_projects/files/ref.png",
            file_size=256,
        )
        self.delete_url = reverse(
            "custom_projects:customer-custom-project-file-delete",
            kwargs={"project_id": self.project.id, "file_id": self.project_file.id},
        )

    def _authenticate(self, user: User) -> None:
        url = reverse("accounts:admin-login") if user == self.admin_user else reverse("accounts:login")
        response = self.client.post(
            url,
            {"email": user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_owner_can_delete_reference_file(self) -> None:
        """Project owner can delete their own reference file."""
        self._authenticate(self.customer_user)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        from custom_projects.models import ProjectFile
        self.assertFalse(ProjectFile.objects.filter(pk=self.project_file.pk).exists())

    def test_other_customer_cannot_delete_reference_file(self) -> None:
        """Another customer receives 404 (no IDOR)."""
        self._authenticate(self.other_customer)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_cannot_delete_reference_file(self) -> None:
        """Unauthenticated request must be denied."""
        self.client.credentials()
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_delete_file_on_completed_project_is_rejected(self) -> None:
        """Deleting a reference file from a completed project must 400."""
        self.project.status = CustomProject.Status.COMPLETED
        self.project.save(update_fields=["status", "updated_at"])
        self._authenticate(self.customer_user)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        from custom_projects.models import ProjectFile
        self.assertTrue(ProjectFile.objects.filter(pk=self.project_file.pk).exists())

    def test_delete_file_on_rejected_project_is_rejected(self) -> None:
        """Deleting a reference file from a rejected project must 400."""
        self.project.status = CustomProject.Status.REJECTED
        self.project.save(update_fields=["status", "updated_at"])
        self._authenticate(self.customer_user)
        response = self.client.delete(self.delete_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_nonexistent_file_returns_400(self) -> None:
        """Attempting to delete a file ID that doesn't exist must 400."""
        import uuid
        self._authenticate(self.customer_user)
        url = reverse(
            "custom_projects:customer-custom-project-file-delete",
            kwargs={"project_id": self.project.id, "file_id": uuid.uuid4()},
        )
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
