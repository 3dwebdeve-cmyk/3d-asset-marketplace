from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from coupons.models import Coupon
from coupons.services import CouponService


class AdminCouponAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.admin = User.objects.create_user(
            email="admin@example.com",
            full_name="Admin User",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.customer = User.objects.create_user(
            email="customer@example.com",
            full_name="Customer User",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.list_url = reverse("coupons_admin:admin-coupons")
        self.login_url = reverse("accounts:login")
        self.admin_login_url = reverse("accounts:admin-login")

    def authenticate(self, user: User) -> None:
        login_url = (
            self.admin_login_url
            if user.role.role_name == "Administrator"
            else self.login_url
        )
        login = self.client.post(
            login_url,
            {"email": user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_customer_cannot_access_admin_coupons(self) -> None:
        self.authenticate(self.customer)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_list_and_update_coupon(self) -> None:
        self.authenticate(self.admin)
        create = self.client.post(
            self.list_url,
            {
                "code": "save10",
                "discount_type": "percent",
                "discount_value": "10.00",
                "max_uses": 100,
                "max_uses_per_user": 1,
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["code"], "SAVE10")
        coupon_id = create.data["id"]

        listed = self.client.get(self.list_url, {"search": "SAVE"})
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)

        detail_url = reverse(
            "coupons_admin:admin-coupon-detail",
            kwargs={"coupon_id": coupon_id},
        )
        updated = self.client.patch(
            detail_url,
            {"discount_value": "15.00", "active": True},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["discount_value"], "15.00")

    def test_reject_invalid_percent_and_duplicate_code(self) -> None:
        self.authenticate(self.admin)
        invalid = self.client.post(
            self.list_url,
            {
                "code": "BADPCT",
                "discount_type": "percent",
                "discount_value": "150.00",
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

        first = self.client.post(
            self.list_url,
            {
                "code": "UNIQUE1",
                "discount_type": "fixed",
                "discount_value": "5.00",
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        duplicate = self.client.post(
            self.list_url,
            {
                "code": "unique1",
                "discount_type": "fixed",
                "discount_value": "5.00",
            },
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deactivate_and_hard_delete_unused(self) -> None:
        self.authenticate(self.admin)
        create = self.client.post(
            self.list_url,
            {
                "code": "TEMPOFF",
                "discount_type": "fixed",
                "discount_value": "3.00",
            },
            format="json",
        )
        coupon_id = create.data["id"]
        detail_url = reverse(
            "coupons_admin:admin-coupon-detail",
            kwargs={"coupon_id": coupon_id},
        )

        deactivated = self.client.delete(detail_url)
        self.assertEqual(deactivated.status_code, status.HTTP_200_OK)
        self.assertFalse(deactivated.data["active"])

        Coupon.objects.filter(pk=coupon_id).update(active=True, times_used=0)
        deleted = self.client.delete(f"{detail_url}?hard=true")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Coupon.objects.filter(pk=coupon_id).exists())

    def test_cannot_hard_delete_used_coupon(self) -> None:
        self.authenticate(self.admin)
        create = self.client.post(
            self.list_url,
            {
                "code": "USED1",
                "discount_type": "fixed",
                "discount_value": "2.00",
            },
            format="json",
        )
        coupon_id = create.data["id"]
        Coupon.objects.filter(pk=coupon_id).update(times_used=1)
        detail_url = reverse(
            "coupons_admin:admin-coupon-detail",
            kwargs={"coupon_id": coupon_id},
        )
        deleted = self.client.delete(f"{detail_url}?hard=true")
        self.assertEqual(deleted.status_code, status.HTTP_400_BAD_REQUEST)

    def test_compute_discount_caps_at_subtotal(self) -> None:
        coupon = Coupon.objects.create(
            code="BIGFIX",
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal("50.00"),
        )
        discount = CouponService.compute_discount(Decimal("20.00"), coupon)
        self.assertEqual(discount, Decimal("20.00"))

        percent = Coupon.objects.create(
            code="HALFOFF",
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal("50.00"),
        )
        self.assertEqual(
            CouponService.compute_discount(Decimal("80.00"), percent),
            Decimal("40.00"),
        )

    def test_expired_coupon_not_redeemable(self) -> None:
        coupon = Coupon.objects.create(
            code="OLDONE",
            discount_type=Coupon.DiscountType.PERCENT,
            discount_value=Decimal("10.00"),
            expiry_date=timezone.now().date() - timedelta(days=1),
        )
        with self.assertRaises(Exception):
            CouponService.assert_redeemable(coupon, subtotal=Decimal("10.00"))
