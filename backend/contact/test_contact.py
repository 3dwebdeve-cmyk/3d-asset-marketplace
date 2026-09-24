from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.throttles import ContactFormRateThrottle
from contact.services import ContactService


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CONTACT_ADMIN_RECIPIENTS="admin-inbox@example.com",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="",
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "contact-form-tests",
        }
    },
)
class ContactSubmissionAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        mail.outbox.clear()
        self.url = reverse("contact:submit")
        self.valid_payload = {
            "name": "Alex Creator",
            "email": "alex@example.com",
            "subject": "Question about custom work",
            "message": "I would like to know more about your custom project process.",
        }

    def test_valid_submission_sends_email(self) -> None:
        response = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], ContactService.SUCCESS_DETAIL)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ["admin-inbox@example.com"])
        self.assertIn("Contact form:", email.subject)
        self.assertIn("Alex Creator", email.body)
        self.assertIn("alex@example.com", email.body)
        self.assertIn("custom project process", email.body)

    def test_missing_fields_return_400(self) -> None:
        response = self.client.post(self.url, {"name": "A"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)

    def test_honeypot_filled_returns_200_without_email(self) -> None:
        payload = {**self.valid_payload, "website": "https://spam.example"}
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], ContactService.SUCCESS_DETAIL)
        self.assertEqual(len(mail.outbox), 0)

    @patch.object(ContactFormRateThrottle, "rate", "1/hour", create=True)
    def test_throttle_exceeded_returns_429(self) -> None:
        first = self.client.post(self.url, self.valid_payload, format="json")
        second = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch("config.mail.send_mail", side_effect=RuntimeError("smtp down"))
    def test_email_failure_still_returns_200(self, _mock_send) -> None:
        response = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], ContactService.SUCCESS_DETAIL)

    @override_settings(
        CONTACT_ADMIN_RECIPIENTS="",
        PROJECT_MESSAGE_ADMIN_RECIPIENTS="",
    )
    def test_falls_back_to_active_administrator_emails(self) -> None:
        admin_role = Role.objects.get(role_name="Administrator")
        User.objects.create_user(
            email="studio-admin@example.com",
            full_name="Studio Admin",
            password="StrongPass123!",
            role=admin_role,
            country="India",
            email_verified=True,
        )

        response = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["studio-admin@example.com"])

    @override_settings(
        CONTACT_ADMIN_RECIPIENTS="",
        PROJECT_MESSAGE_ADMIN_RECIPIENTS="project-inbox@example.com",
    )
    def test_falls_back_to_project_message_recipients(self) -> None:
        response = self.client.post(self.url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["project-inbox@example.com"])
