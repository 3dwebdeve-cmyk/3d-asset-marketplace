from decimal import Decimal
from uuid import uuid4

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from custom_projects.models import CustomProject, ProjectDelivery, ProjectQuotation
from custom_projects.services import CustomProjectService, ProjectQuotationData
from notifications.models import Notification
from notifications.services import NotificationService
from orders.models import Order
from orders.services import OrderService
from products.models import Product


class NotificationAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")

        self.customer = User.objects.create_user(
            email="notify-customer@example.com",
            full_name="Notify Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="notify-other@example.com",
            full_name="Other Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin = User.objects.create_user(
            email="notify-admin@example.com",
            full_name="Notify Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff", "updated_at"])

        self.list_url = reverse("notifications:notification-list")
        self.unread_url = reverse("notifications:notification-unread-count")
        self.read_all_url = reverse("notifications:notification-read-all")

        self.mine = Notification.objects.create(
            user=self.customer,
            title="Quotation ready",
            message="A quotation is ready for your project.",
            link="/dashboard/projects/example",
        )
        self.mine_read = Notification.objects.create(
            user=self.customer,
            title="Order updated",
            message="Order INV-1 is now paid.",
            link="/dashboard/orders/example",
            is_read=True,
        )
        Notification.objects.create(
            user=self.other_customer,
            title="Other user notice",
            message="Should never appear for the primary customer.",
            link="/dashboard",
        )

    def _login(self, user: User) -> None:
        response = self.client.post(
            reverse("accounts:login"),
            {"email": user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_list_requires_authentication(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_returns_only_own_notifications(self) -> None:
        self._login(self.customer)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        titles = {item["title"] for item in response.data["results"]}
        self.assertEqual(titles, {"Quotation ready", "Order updated"})
        self.assertNotIn("Other user notice", titles)

    def test_list_supports_is_read_filter_and_pagination(self) -> None:
        self._login(self.customer)
        unread = self.client.get(self.list_url, {"is_read": "false", "page_size": 1})
        self.assertEqual(unread.status_code, status.HTTP_200_OK)
        self.assertEqual(unread.data["count"], 1)
        self.assertEqual(len(unread.data["results"]), 1)
        self.assertFalse(unread.data["results"][0]["is_read"])

        bad = self.client.get(self.list_url, {"is_read": "maybe"})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_read", bad.data)

    def test_unread_count(self) -> None:
        self._login(self.customer)
        response = self.client.get(self.unread_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unread_count"], 1)

    def test_mark_one_read_is_owner_only(self) -> None:
        self._login(self.customer)
        url = reverse(
            "notifications:notification-mark-read",
            kwargs={"notification_id": self.mine.id},
        )
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_read"])
        self.mine.refresh_from_db()
        self.assertTrue(self.mine.is_read)

        other = Notification.objects.get(user=self.other_customer)
        forbidden = self.client.post(
            reverse(
                "notifications:notification-mark-read",
                kwargs={"notification_id": other.id},
            )
        )
        self.assertEqual(forbidden.status_code, status.HTTP_404_NOT_FOUND)

    def test_mark_all_read(self) -> None:
        self._login(self.customer)
        response = self.client.post(self.read_all_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 1)
        self.assertEqual(response.data["unread_count"], 0)
        self.assertEqual(
            Notification.objects.filter(user=self.customer, is_read=False).count(),
            0,
        )


class NotificationEmitTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer = User.objects.create_user(
            email="emit-customer@example.com",
            full_name="Emit Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin = User.objects.create_user(
            email="emit-admin@example.com",
            full_name="Emit Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff", "updated_at"])

        self.project = CustomProject.objects.create(
            customer=self.customer,
            assigned_designer=self.admin,
            title="Notification crate",
            description="Project used to exercise in-app notification emits.",
            status=CustomProject.Status.UNDER_REVIEW,
        )
        self.category = Category.objects.create(name="Emit Props", slug="emit-props")
        self.product = Product.objects.create(
            category=self.category,
            name="Emit Chair",
            slug="emit-chair",
            price=Decimal("25.00"),
            status=Product.Status.PUBLISHED,
        )

    def test_quotation_sent_emits_customer_notification(self) -> None:
        CustomProjectService.upsert_quotation(
            self.project,
            ProjectQuotationData(
                amount=Decimal("120.00"),
                currency="USD",
                estimated_delivery=None,
                notes="Short quote",
                status=ProjectQuotation.Status.PENDING,
            ),
        )
        notice = Notification.objects.get(user=self.customer)
        self.assertEqual(notice.title, "Quotation ready")
        self.assertIn(str(self.project.id), notice.link)
        self.assertFalse(notice.is_read)

    def test_staff_message_emits_customer_notification(self) -> None:
        CustomProjectService.create_message(
            self.project,
            sender=self.admin,
            body="Hello from admin",
        )
        notice = Notification.objects.get(user=self.customer)
        self.assertEqual(notice.title, "New project message")
        self.assertIn("/dashboard/projects/", notice.link)

    def test_customer_message_emits_designer_notification(self) -> None:
        CustomProjectService.create_message(
            self.project,
            sender=self.customer,
            body="Hello from customer",
        )
        notice = Notification.objects.get(user=self.admin)
        self.assertEqual(notice.title, "New project message")
        self.assertIn("/admin/projects/", notice.link)

    def test_delivery_upload_emits_customer_notification(self) -> None:
        delivery = ProjectDelivery.objects.create(
            project=self.project,
            uploaded_by=self.admin,
            file_name="delivery.zip",
            storage_path=f"deliveries/{self.project.id}/{uuid4().hex}.zip",
            file_size=16,
            version=1,
            notes="",
        )
        NotificationService.notify_delivery_uploaded(delivery)
        notice = Notification.objects.get(user=self.customer)
        self.assertEqual(notice.title, "Project delivery uploaded")
        self.assertIn("v1", notice.message)
        self.assertIn(str(self.project.id), notice.link)

    def test_order_status_change_emits_customer_notification(self) -> None:
        order = Order.objects.create(
            user=self.customer,
            invoice_number="INV-NOTIFY-0001",
            total_amount=Decimal("25.00"),
            currency="USD",
            order_status=Order.OrderStatus.PENDING,
            payment_status=Order.PaymentStatus.PENDING,
        )
        with self.captureOnCommitCallbacks(execute=True):
            OrderService.update_order_status(order, Order.OrderStatus.PAID)
        notice = Notification.objects.get(user=self.customer)
        self.assertEqual(notice.title, "Order status updated")
        self.assertIn("paid", notice.message.lower())
        self.assertIn(str(order.id), notice.link)

    def test_notify_user_fail_soft_on_inactive_user(self) -> None:
        self.customer.is_active = False
        self.customer.save(update_fields=["is_active", "updated_at"])
        result = NotificationService.notify_user(
            self.customer,
            title="Should skip",
            message="Inactive users do not receive notifications.",
        )
        self.assertIsNone(result)
        self.assertEqual(Notification.objects.filter(user=self.customer).count(), 0)
