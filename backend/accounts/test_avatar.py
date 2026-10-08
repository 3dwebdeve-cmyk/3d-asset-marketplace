from unittest.mock import patch

import io
import tempfile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User, UserProfile


def make_image_bytes(format_name: str = "PNG", size=(64, 64), color=(20, 120, 200)) -> bytes:
    buffer = io.BytesIO()
    image = Image.new("RGB", size, color=color)
    image.save(buffer, format=format_name)
    return buffer.getvalue()


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AvatarUploadAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="avatar-user@example.com",
            full_name="Avatar User",
            password=self.password,
            role=self.customer_role,
            country="India",
            email_verified=True,
        )
        self.avatar_url = reverse("accounts:profile-avatar")
        self.profile_url = reverse("accounts:profile")
        self.login_url = reverse("accounts:login")

    def _authenticate(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_avatar_upload_requires_authentication(self) -> None:
        image = SimpleUploadedFile(
            "avatar.png",
            make_image_bytes(),
            content_type="image/png",
        )
        response = self.client.post(self.avatar_url, {"avatar": image}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_upload_avatar_stores_url_reference(self) -> None:
        self._authenticate()
        image = SimpleUploadedFile(
            "avatar.png",
            make_image_bytes(),
            content_type="image/png",
        )

        response = self.client.post(self.avatar_url, {"avatar": image}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["avatar"])
        self.assertIn("/media/avatars/", response.data["avatar"])
        self.assertTrue(response.data["avatar"].endswith(".webp"))
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar.startswith("http://"))
        self.assertIn("/media/avatars/", self.user.avatar)

        profile_response = self.client.get(self.profile_url)
        self.assertEqual(profile_response.data["avatar"], response.data["avatar"])

    def test_upload_rejects_invalid_extension(self) -> None:
        self._authenticate()
        fake = SimpleUploadedFile(
            "avatar.gif",
            make_image_bytes(),
            content_type="image/gif",
        )

        response = self.client.post(self.avatar_url, {"avatar": fake}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.data)

    def test_upload_rejects_oversized_file(self) -> None:
        self._authenticate()
        image_bytes = make_image_bytes(size=(400, 400))
        self.assertGreater(len(image_bytes), 100)
        oversized = SimpleUploadedFile(
            "big.png",
            image_bytes,
            content_type="image/png",
        )

        with patch("accounts.upload_rules.AVATAR_MAX_BYTES", 100):
            response = self.client.post(
                self.avatar_url,
                {"avatar": oversized},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.data)

    def test_upload_rejects_mismatched_content(self) -> None:
        self._authenticate()
        fake = SimpleUploadedFile(
            "avatar.png",
            b"not-an-image",
            content_type="image/png",
        )

        response = self.client.post(self.avatar_url, {"avatar": fake}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.data)

    def test_delete_avatar_clears_reference(self) -> None:
        self._authenticate()
        image = SimpleUploadedFile(
            "avatar.png",
            make_image_bytes(),
            content_type="image/png",
        )
        upload_response = self.client.post(
            self.avatar_url,
            {"avatar": image},
            format="multipart",
        )
        self.assertEqual(upload_response.status_code, status.HTTP_200_OK)

        delete_response = self.client.delete(self.avatar_url)

        self.assertEqual(delete_response.status_code, status.HTTP_200_OK)
        self.assertEqual(delete_response.data["avatar"], "")
        self.user.refresh_from_db()
        self.assertEqual(self.user.avatar, "")
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())
