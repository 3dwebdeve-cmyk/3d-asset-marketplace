from decimal import Decimal
from uuid import uuid4

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from orders.models import Order, OrderItem
from orders.services import OrderCreateData, OrderItemCreateData, OrderService
from plugins.models import Plugin, PluginCategory
from products.models import Product
from reviews.models import Review, ReviewReaction, ReviewReply, ReviewReplyReaction


class ReviewAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.password = "StrongPass123!"

        self.customer = User.objects.create_user(
            email="reviewer@example.com",
            full_name="Review Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="other-reviewer@example.com",
            full_name="Other Reviewer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin = User.objects.create_user(
            email="admin-review@example.com",
            full_name="Admin Reviewer",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )

        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.product = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )
        self.draft_product = Product.objects.create(
            category=self.category,
            name="Draft Desk",
            slug="draft-desk",
            price=Decimal("99.00"),
            status=Product.Status.DRAFT,
        )

        self.plugin_category = PluginCategory.objects.create(
            name="Tools",
            slug="tools",
            is_active=True,
        )
        self.plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="UV Toolkit",
            slug="uv-toolkit",
            price=Decimal("19.99"),
            status=Plugin.Status.PUBLISHED,
        )

        self.list_url = reverse("reviews:review-list-create")
        self.mine_url = reverse("reviews:review-mine")
        self.eligibility_url = reverse("reviews:review-eligibility")
        self.admin_list_url = reverse("reviews_admin:admin-review-list")
        self.login_url = reverse("accounts:login")
        self.admin_login_url = reverse("accounts:admin-login")

    def authenticate(self, user: User | None = None) -> None:
        target = user or self.customer
        login = self.client.post(
            self.login_url,
            {"email": target.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def authenticate_admin(self) -> None:
        login = self.client.post(
            self.admin_login_url,
            {"email": self.admin.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def create_paid_order(
        self,
        user: User,
        *,
        product_type: str = "product",
        product_id=None,
    ) -> Order:
        order = OrderService.create(
            OrderCreateData(
                user_id=user.pk,
                items=(
                    OrderItemCreateData(
                        product_type=product_type,
                        product_id=product_id or self.product.pk,
                        quantity=1,
                    ),
                ),
                currency="USD",
            )
        )
        OrderService.update_order_status(order, Order.OrderStatus.PAID)
        return OrderService.update_payment_status(order, Order.PaymentStatus.PAID)

    def test_unauthenticated_post_returns_401(self) -> None:
        response = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "rating": 5,
                "review_text": "Great",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_comment_without_purchase(self) -> None:
        self.customer.avatar = "https://cdn.example.com/reviewer-avatar.jpg"
        self.customer.save(update_fields=["avatar"])
        self.authenticate()

        response = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "review_text": "Nice chair",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["rating"])
        self.assertEqual(response.data["review_text"], "Nice chair")
        self.assertEqual(
            response.data["author"]["avatar"],
            "https://cdn.example.com/reviewer-avatar.jpg",
        )
        self.assertTrue(
            Review.objects.filter(
                user=self.customer,
                product_type=Review.ProductType.PRODUCT,
                product_id=self.product.pk,
            ).exists()
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 0)
        self.assertEqual(self.product.average_rating, Decimal("0.00"))

    def test_empty_comment_and_rating_are_rejected(self) -> None:
        self.authenticate()

        response = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "review_text": "   ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("review_text", response.data)

    def test_non_buyer_cannot_affect_rating(self) -> None:
        self.authenticate()
        response = self.client.post(self.list_url, {
            "product_type": "product", "product_id": str(self.product.pk),
            "rating": 5, "review_text": "Not purchased",
        }, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Review.objects.filter(user=self.customer).exists())

    def test_new_comment_does_not_unhide_moderated_comment(self) -> None:
        review = Review.objects.create(user=self.customer, product_type="product",
            product_id=self.product.pk, rating=None, review_text="Hidden", is_hidden=True)
        self.authenticate()
        response = self.client.post(self.list_url, {
            "product_type": "product", "product_id": str(self.product.pk),
            "review_text": "Edited",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        review.refresh_from_db()
        self.assertTrue(review.is_hidden)
        self.assertEqual(
            Review.objects.filter(
                user=self.customer,
                product_type="product",
                product_id=self.product.pk,
            ).count(),
            2,
        )

    def test_create_review_after_paid_order_updates_aggregates(self) -> None:
        self.create_paid_order(self.customer)
        self.authenticate()

        response = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "rating": 5,
                "review_text": "Excellent asset",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["rating"], 5)
        self.assertEqual(response.data["author"]["full_name"], "Review Customer")
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 1)
        self.assertEqual(self.product.average_rating, Decimal("5.00"))

    def test_additional_comment_creates_a_new_newest_review(self) -> None:
        self.create_paid_order(self.customer)
        self.authenticate()

        first = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "rating": 4,
                "review_text": "Good",
            },
            format="json",
        )
        second = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "review_text": "Even better",
            },
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Review.objects.filter(user=self.customer).count(), 2)

        listing = self.client.get(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
            },
        )
        self.assertEqual(listing.data["results"][0]["review_text"], "Even better")
        self.assertEqual(listing.data["results"][1]["review_text"], "Good")
        self.product.refresh_from_db()
        self.assertEqual(self.product.average_rating, Decimal("4.00"))
        self.assertEqual(self.product.review_count, 1)

    def test_user_cannot_submit_multiple_ratings_for_one_product(self) -> None:
        self.create_paid_order(self.customer)
        self.authenticate()

        first = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "rating": 4,
                "review_text": "Good",
            },
            format="json",
        )
        second = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "rating": 5,
                "review_text": "Another comment",
            },
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already rated", str(second.data))
        self.assertEqual(Review.objects.filter(user=self.customer).count(), 1)

    def test_user_can_post_at_most_five_comments_per_product(self) -> None:
        Review.objects.bulk_create(
            [
                Review(
                    user=self.customer,
                    product_type=Review.ProductType.PRODUCT,
                    product_id=self.product.pk,
                    review_text=f"Comment {index}",
                )
                for index in range(5)
            ]
        )
        self.authenticate()

        response = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "review_text": "Comment 6",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("maximum of 5 comments", str(response.data))
        self.assertEqual(
            Review.objects.filter(
                user=self.customer,
                product_type=Review.ProductType.PRODUCT,
                product_id=self.product.pk,
            ).count(),
            5,
        )

    def test_public_list_excludes_hidden_reviews(self) -> None:
        self.create_paid_order(self.customer)
        self.create_paid_order(self.other_customer)
        visible = Review.objects.create(
            user=self.customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            rating=5,
            review_text="Visible",
        )
        Review.objects.create(
            user=self.other_customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            rating=1,
            review_text="Hidden abuse",
            is_hidden=True,
        )

        response = self.client.get(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(visible.pk))

    def test_mine_and_eligibility_endpoints(self) -> None:
        self.authenticate()

        eligibility = self.client.get(
            self.eligibility_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
            },
        )
        self.assertEqual(eligibility.status_code, status.HTTP_200_OK)
        self.assertTrue(eligibility.data["can_review"])
        self.assertFalse(eligibility.data["has_reviewed"])

        self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
                "review_text": "Solid",
            },
            format="json",
        )

        mine = self.client.get(
            self.mine_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
            },
        )
        self.assertEqual(mine.status_code, status.HTTP_200_OK)
        self.assertIsNone(mine.data["rating"])

        eligibility2 = self.client.get(
            self.eligibility_url,
            {
                "product_type": "product",
                "product_id": str(self.product.pk),
            },
        )
        self.assertTrue(eligibility2.data["has_reviewed"])

    def test_admin_can_hide_and_delete_review(self) -> None:
        self.create_paid_order(self.customer)
        review = Review.objects.create(
            user=self.customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            rating=5,
            review_text="Spam",
        )
        from reviews.services import ReviewService

        ReviewService._recompute_aggregates(
            Review.ProductType.PRODUCT,
            self.product.pk,
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 1)

        self.authenticate_admin()
        detail_url = reverse(
            "reviews_admin:admin-review-detail",
            kwargs={"review_id": review.pk},
        )

        hide = self.client.patch(detail_url, {"is_hidden": True}, format="json")
        self.assertEqual(hide.status_code, status.HTTP_200_OK)
        self.assertTrue(hide.data["is_hidden"])
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 0)
        self.assertEqual(self.product.average_rating, Decimal("0.00"))

        unhide = self.client.patch(detail_url, {"is_hidden": False}, format="json")
        self.assertEqual(unhide.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 1)

        delete = self.client.delete(detail_url)
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Review.objects.filter(pk=review.pk).exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.review_count, 0)

    def test_admin_list_includes_hidden_and_filters(self) -> None:
        self.create_paid_order(self.customer)
        self.create_paid_order(self.customer, product_type="plugin", product_id=self.plugin.pk)
        Review.objects.create(
            user=self.customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            rating=5,
            review_text="Chair review",
            is_hidden=True,
        )
        Review.objects.create(
            user=self.customer,
            product_type=Review.ProductType.PLUGIN,
            product_id=self.plugin.pk,
            rating=4,
            review_text="Plugin review",
        )

        self.authenticate_admin()
        response = self.client.get(
            self.admin_list_url,
            {"product_type": "product", "is_hidden": "true"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["catalog"]["slug"], "oak-chair")
        self.assertIn("author_email", response.data["results"][0])

    def test_cannot_review_draft_product(self) -> None:
        Order.objects.create(
            user=self.customer,
            invoice_number="INV-TEST-DRAFT",
            total_amount=Decimal("10.00"),
            order_status=Order.OrderStatus.PAID,
            payment_status=Order.PaymentStatus.PAID,
        )
        # Direct OrderItem bypass (draft not creatable via OrderService)
        order = Order.objects.get(invoice_number="INV-TEST-DRAFT")
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=self.draft_product.pk,
            quantity=1,
            purchase_price=Decimal("10.00"),
        )
        self.authenticate()

        response = self.client.post(
            self.list_url,
            {
                "product_type": "product",
                "product_id": str(self.draft_product.pk),
                "rating": 5,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customer_cannot_access_admin_endpoints(self) -> None:
        self.authenticate()
        response = self.client.get(self.admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_order_patch_marks_paid(self) -> None:
        order = OrderService.create(
            OrderCreateData(
                user_id=self.customer.pk,
                items=(
                    OrderItemCreateData(
                        product_type="product",
                        product_id=self.product.pk,
                        quantity=1,
                    ),
                ),
            )
        )
        self.authenticate_admin()
        url = reverse("orders_admin:admin-order-detail", kwargs={"order_id": order.pk})

        response = self.client.patch(
            url,
            {"order_status": "paid", "payment_status": "paid"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["order_status"], "paid")
        self.assertEqual(response.data["payment_status"], "paid")

    def test_missing_list_filters_return_400(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_detail_not_found(self) -> None:
        self.authenticate_admin()
        response = self.client.patch(
            reverse("reviews_admin:admin-review-detail", kwargs={"review_id": uuid4()}),
            {"is_hidden": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_authenticated_user_can_reply_to_comment(self) -> None:
        review = Review.objects.create(
            user=self.other_customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            review_text="Original comment",
        )
        self.authenticate()
        response = self.client.post(
            reverse("reviews:review-reply-create", kwargs={"review_id": review.pk}),
            {"text": "Helpful reply"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ReviewReply.objects.filter(review=review, user=self.customer).exists())

    def test_authenticated_user_can_reply_to_an_existing_reply(self) -> None:
        review = Review.objects.create(
            user=self.other_customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            review_text="Original comment",
        )
        parent = ReviewReply.objects.create(
            review=review,
            user=self.other_customer,
            text="First reply",
        )
        self.authenticate()
        response = self.client.post(
            reverse("reviews:review-reply-create", kwargs={"review_id": review.pk}),
            {"text": "Nested response", "parent_id": str(parent.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data["parent_id"]), str(parent.pk))

    def test_reply_reaction_toggles_and_switches(self) -> None:
        review = Review.objects.create(
            user=self.other_customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            review_text="Original comment",
        )
        reply = ReviewReply.objects.create(review=review, user=self.other_customer, text="A reply")
        self.authenticate()
        url = reverse("reviews:review-reply-reaction", kwargs={"reply_id": reply.pk})

        liked = self.client.post(url, {"value": "like"}, format="json")
        self.assertEqual(liked.status_code, status.HTTP_200_OK)
        self.assertEqual(liked.data["like_count"], 1)
        disliked = self.client.post(url, {"value": "dislike"}, format="json")
        self.assertEqual(disliked.data["like_count"], 0)
        self.assertEqual(disliked.data["dislike_count"], 1)
        toggled_off = self.client.post(url, {"value": "dislike"}, format="json")
        self.assertIsNone(toggled_off.data["viewer_reaction"])
        self.assertFalse(ReviewReplyReaction.objects.filter(reply=reply, user=self.customer).exists())

    def test_reaction_toggles_and_switches(self) -> None:
        review = Review.objects.create(
            user=self.other_customer,
            product_type=Review.ProductType.PRODUCT,
            product_id=self.product.pk,
            review_text="Original comment",
        )
        self.authenticate()
        url = reverse("reviews:review-reaction", kwargs={"review_id": review.pk})
        liked = self.client.post(url, {"value": "like"}, format="json")
        self.assertEqual(liked.status_code, status.HTTP_200_OK)
        self.assertEqual(liked.data["like_count"], 1)
        disliked = self.client.post(url, {"value": "dislike"}, format="json")
        self.assertEqual(disliked.data["like_count"], 0)
        self.assertEqual(disliked.data["dislike_count"], 1)
        toggled_off = self.client.post(url, {"value": "dislike"}, format="json")
        self.assertIsNone(toggled_off.data["viewer_reaction"])
        self.assertFalse(ReviewReaction.objects.filter(review=review, user=self.customer).exists())
