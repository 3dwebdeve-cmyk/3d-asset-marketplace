"""New categories from uploads (docs/PACKAGES_PIPELINE.md, Phase 2): the waiting list, Approve,
Merge into, Reject, and the Model ID code in /console."""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from rest_framework import status

from categories.models import Category
from categories.test_categories import CategoryAdminAPITests
from products.models import Product

_SETUP = CategoryAdminAPITests.__dict__


class CategoryApprovalTests(CategoryAdminAPITests.__base__):
    setUp = _SETUP["setUp"]
    _authenticate_as_admin = _SETUP["_authenticate_as_admin"]

    def _pending(self, name: str = "Outdoor", code: str = "OUT", **fields) -> Category:
        return Category.objects.create(
            name=name,
            slug=name.lower(),
            code=code,
            is_active=False,
            pending_approval=True,
            created_by_import=True,
            created_from_batch="2026-11-16-run-01",
            **fields,
        )

    def _product(self, category: Category, sku: str = "OUT-000001") -> Product:
        return Product.objects.create(
            category=category, name=sku, slug=sku.lower(), sku=sku, price=Decimal("0.00"),
            status=Product.Status.PENDING_REVIEW,
        )

    def _action(self, category: Category, action: str, body: dict | None = None):
        url = reverse(f"categories_admin:admin-category-{action}", kwargs={"category_id": category.pk})
        return self.client.post(url, body or {}, format="json")

    def test_the_waiting_list_shows_counts_and_the_batch(self) -> None:
        self._authenticate_as_admin()
        pending = self._pending()
        self._product(pending)

        response = self.client.get(self.list_url, {"pending_approval": "true"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["code"], "OUT")
        self.assertEqual(row["product_count"], 1)
        self.assertEqual(row["created_from_batch"], "2026-11-16-run-01")
        self.assertTrue(row["created_by_import"])
        self.assertIsNone(row["rejected_at"])

    def test_approve_puts_the_category_live(self) -> None:
        self._authenticate_as_admin()
        pending = self._pending()

        response = self._action(pending, "approve")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        pending.refresh_from_db()
        self.assertTrue(pending.is_active)
        self.assertFalse(pending.pending_approval)
        public = self.client.get(reverse("categories:category-list"))
        self.assertIn("outdoor", {row["slug"] for row in public.data["results"]})
        # Only a pending category can be approved.
        self.assertEqual(self._action(pending, "approve").status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_public_site_never_shows_a_pending_category(self) -> None:
        self._pending()
        public = self.client.get(reverse("categories:category-list"))
        self.assertNotIn("outdoor", {row["slug"] for row in public.data["results"]})
        detail = self.client.get(reverse("categories:category-detail", kwargs={"slug": "outdoor"}))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_merge_moves_the_models_and_hands_over_the_code(self) -> None:
        self._authenticate_as_admin()
        typo = self._pending("Furnture", "FUR")
        product = self._product(typo, "FUR-000001")
        furniture = Category.objects.create(name="Furniture", slug="furniture")

        response = self._action(typo, "merge", {"into": str(furniture.pk)})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["id"], str(furniture.pk))
        self.assertFalse(Category.objects.filter(pk=typo.pk).exists())
        product.refresh_from_db()
        self.assertEqual(product.category_id, furniture.pk)
        furniture.refresh_from_db()
        self.assertEqual(furniture.code, "FUR")

    def test_merge_keeps_the_target_code_and_needs_an_active_target(self) -> None:
        self._authenticate_as_admin()
        typo = self._pending("Furnture", "FUR")
        furniture = Category.objects.create(name="Furniture", slug="furniture", code="FRN")
        other_pending = self._pending("Garden", "GAR")

        self.assertEqual(
            self._action(typo, "merge", {"into": str(other_pending.pk)}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(self._action(typo, "merge", {"into": str(furniture.pk)}).status_code, 200)
        furniture.refresh_from_db()
        self.assertEqual(furniture.code, "FRN")

    def test_reject_deletes_an_empty_category(self) -> None:
        self._authenticate_as_admin()
        pending = self._pending()
        response = self._action(pending, "reject")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Category.objects.filter(pk=pending.pk).exists())

    def test_reject_keeps_a_category_with_models_hidden_and_blocks_them(self) -> None:
        self._authenticate_as_admin()
        pending = self._pending()
        self._product(pending)

        response = self._action(pending, "reject")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIsNotNone(response.data["rejected_at"])
        pending.refresh_from_db()
        self.assertFalse(pending.is_active)
        self.assertTrue(pending.pending_approval)
        # Approve still works afterwards, and clears the rejection.
        self._action(pending, "approve")
        pending.refresh_from_db()
        self.assertIsNone(pending.rejected_at)

    def test_patch_cannot_switch_a_pending_category_on(self) -> None:
        self._authenticate_as_admin()
        pending = self._pending()
        url = reverse("categories_admin:admin-category-detail", kwargs={"category_id": pending.pk})
        response = self.client.patch(url, {"is_active": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        pending.refresh_from_db()
        self.assertFalse(pending.is_active)

    def test_the_code_is_set_while_empty_and_fixed_once_the_category_has_models(self) -> None:
        self._authenticate_as_admin()
        response = self.client.patch(self.detail_url, {"code": "VEH"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["code"], "VEH")

        self._product(self.category, "VEH-000001")
        response = self.client.patch(self.detail_url, {"code": "CAR"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.patch(self.detail_url, {"code": None}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Sending the same code again is not a change.
        self.assertEqual(self.client.patch(self.detail_url, {"code": "VEH"}, format="json").status_code, 200)

    def test_a_code_must_be_unique_and_two_to_five_capital_letters(self) -> None:
        self._authenticate_as_admin()
        Category.objects.create(name="Electronics", slug="electronics", code="ELE")
        for code in ("ELE", "ele", "E", "ABCDEF", "E1E"):
            with self.subTest(code=code):
                response = self.client.patch(self.detail_url, {"code": code}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_a_new_category_can_be_created_with_a_code(self) -> None:
        self._authenticate_as_admin()
        response = self.client.post(self.list_url, {"name": "Lighting", "code": "LIT"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Category.objects.get(slug="lighting").code, "LIT")
        duplicate = self.client.post(self.list_url, {"name": "Lamps", "code": "LIT"}, format="json")
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
