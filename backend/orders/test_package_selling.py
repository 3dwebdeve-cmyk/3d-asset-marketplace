"""Packages pipeline, Phase 4 (docs/PACKAGES_PIPELINE.md): selling packages. Ownership per
package, the cart and checkout per package, downloads of owned packages only, the free download
by package, and the storefront's package list, bundle saving and "from" price."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from cart.models import CartItem
from categories.models import Category
from downloads.services import DownloadService
from orders.entitlements import EVERY_PACKAGE, owned_package_kinds, user_owns_catalog_item
from orders.models import Order, OrderItem
from orders.services import OrderCreateData, OrderError, OrderItemCreateData, OrderService
from payments.checkout_service import CheckoutService
from payments.models import Payment
from plugins.models import Plugin, PluginCategory
from products.models import Product, ProductFile
from products.packages import sync_summary_price
from products.testing import sell_package

SIGNED = {"download_url": "https://files.example/zip", "expires_in": 60, "file_name": "x.zip"}


class PackageSellingTestBase(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        role = Role.objects.get(role_name="Customer")
        self.buyer = User.objects.create_user(
            email="buyer@example.com",
            full_name="Package Buyer",
            password="StrongPass123!",
            role=role,
            email_verified=True,
        )
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.chair = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            price=Decimal("0.00"),
            status=Product.Status.PUBLISHED,
        )
        self.rig = sell_package(self.chair, "with_light_rig", "15.00")
        self.glb = sell_package(self.chair, "glb_only", "10.00")
        self.whole = sell_package(self.chair, "whole", "20.00")
        # A package with no price yet is not sold.
        self.environment = sell_package(self.chair, "environment", "1.00")
        ProductFile.objects.filter(pk=self.environment.pk).update(price=None)
        # A file added in the console before packages existed (no kind, D7).
        self.extra = ProductFile.objects.create(
            product=self.chair,
            file_name="oak-chair-extras.zip",
            file_format="zip",
            file_size=10,
            storage_path="products/files/oak-chair-extras.zip",
        )
        sync_summary_price(self.chair)
        self.client.force_authenticate(self.buyer)
        self.cart_url = reverse("cart:cart-detail")

    def buy(self, kind: str, *, product: Product | None = None, paid: bool = True, disputed: bool = False) -> Order:
        product = product or self.chair
        order = Order.objects.create(
            user=self.buyer,
            invoice_number=f"INV-{product.slug}-{kind or 'legacy'}-{Order.objects.count()}",
            total_amount=Decimal("10.00"),
            order_status=Order.OrderStatus.PAID if paid else Order.OrderStatus.PENDING,
            payment_status=Order.PaymentStatus.PAID if paid else Order.PaymentStatus.PENDING,
        )
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=product.pk,
            package_kind=kind,
            quantity=1,
            purchase_price=Decimal("10.00"),
        )
        if disputed:
            Payment.objects.create(
                order=order,
                stripe_checkout_session_id=f"cs_disputed_{order.pk.hex[:8]}",
                amount=Decimal("10.00"),
                currency="USD",
                status=Payment.Status.DISPUTED,
            )
        return order

    def add(self, kind: str | None, product: Product | None = None):
        body = {"product_type": "product", "product_id": str((product or self.chair).pk)}
        if kind is not None:
            body["package_kind"] = kind
        return self.client.post(self.cart_url, body, format="json")


class OwnershipTests(PackageSellingTestBase):
    def owned(self) -> frozenset[str]:
        return owned_package_kinds(self.buyer, [self.chair.pk]).get(self.chair.pk, frozenset())

    def test_a_single_package_gives_that_package_only(self) -> None:
        self.buy("with_light_rig")
        self.assertEqual(self.owned(), frozenset({"with_light_rig"}))

    def test_whole_file_gives_every_package_and_the_files_without_a_kind(self) -> None:
        self.buy("whole")
        self.assertEqual(self.owned(), EVERY_PACKAGE)
        self.assertIn("", self.owned())

    def test_an_order_from_before_packages_gives_every_package(self) -> None:
        self.buy("")
        self.assertEqual(self.owned(), EVERY_PACKAGE)

    def test_a_disputed_or_unpaid_order_gives_nothing(self) -> None:
        self.buy("whole", disputed=True)
        self.buy("glb_only", paid=False)
        self.assertEqual(self.owned(), frozenset())

    def test_any_owned_package_is_enough_to_review(self) -> None:
        self.buy("glb_only")
        self.assertTrue(user_owns_catalog_item(self.buyer, "product", self.chair.pk))

    def test_plugins_keep_their_own_check(self) -> None:
        plugin = Plugin.objects.create(
            category=PluginCategory.objects.create(name="Tools", slug="tools", is_active=True),
            name="UV Tool",
            slug="uv-tool",
            price=Decimal("9.00"),
            status=Plugin.Status.PUBLISHED,
        )
        self.assertFalse(user_owns_catalog_item(self.buyer, "plugin", plugin.pk))
        order = self.buy("glb_only")
        OrderItem.objects.create(
            order=order, product_type="plugin", product_id=plugin.pk, quantity=1, purchase_price=Decimal("9.00")
        )
        self.assertTrue(user_owns_catalog_item(self.buyer, "plugin", plugin.pk))


class CartTests(PackageSellingTestBase):
    def test_two_packages_of_one_model_are_two_lines_priced_by_package(self) -> None:
        self.assertEqual(self.add("with_light_rig").status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.add("glb_only").status_code, status.HTTP_201_CREATED)

        cart = self.client.get(self.cart_url).data
        lines = {line["package_kind"]: line for line in cart["items"]}
        self.assertEqual(set(lines), {"with_light_rig", "glb_only"})
        self.assertEqual(lines["with_light_rig"]["unit_price"], "15.00")
        self.assertEqual(lines["with_light_rig"]["catalog"]["title"], "Oak Chair - With Light Rig")
        self.assertEqual(lines["glb_only"]["catalog"]["package_label"], "GLB Only")
        self.assertEqual(cart["subtotal"], "25.00")

    def test_a_running_package_sale_is_charged(self) -> None:
        ProductFile.objects.filter(pk=self.glb.pk).update(discount_price=Decimal("8.00"))
        self.add("glb_only")
        line = self.client.get(self.cart_url).data["items"][0]
        self.assertEqual((line["catalog"]["price"], line["unit_price"]), ("10.00", "8.00"))

    def test_whole_file_with_other_packages_of_the_model_says_it_holds_them(self) -> None:
        self.add("glb_only")
        self.add("whole")
        lines = {line["package_kind"]: line for line in self.client.get(self.cart_url).data["items"]}
        self.assertIn("GLB Only", lines["whole"]["catalog"]["bundle_hint"])
        self.assertEqual(lines["glb_only"]["catalog"]["bundle_hint"], "")

    def test_a_model_line_needs_a_package_the_model_sells(self) -> None:
        for kind, field in ((None, "package_kind"), ("environment", "package_kind"), ("without_light_rig", "package_kind")):
            with self.subTest(kind=kind):
                response = self.add(kind)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
                self.assertIn(field, str(response.data))
        self.assertFalse(CartItem.objects.exists())

    def test_a_package_of_an_unpublished_model_is_refused(self) -> None:
        Product.objects.filter(pk=self.chair.pk).update(status=Product.Status.AWAITING_PRICE)
        self.assertEqual(self.add("whole").status_code, status.HTTP_400_BAD_REQUEST)

    def test_an_owned_package_is_refused_and_whole_file_owns_them_all(self) -> None:
        self.buy("glb_only")
        self.assertEqual(self.add("glb_only").status_code, status.HTTP_400_BAD_REQUEST)
        # Another package, or Whole File at its full price (no upgrade pricing, D5), is sold.
        self.assertEqual(self.add("with_light_rig").status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.add("whole").status_code, status.HTTP_201_CREATED)

        self.buy("whole")
        for kind in ("with_light_rig", "glb_only", "whole"):
            with self.subTest(kind=kind):
                CartItem.objects.all().delete()
                self.assertEqual(self.add(kind).status_code, status.HTTP_400_BAD_REQUEST)


class CheckoutTests(PackageSellingTestBase):
    def test_each_package_is_an_order_line_with_its_kind_price_and_title(self) -> None:
        self.add("with_light_rig")
        self.add("whole")

        order = OrderService.create_from_cart(self.buyer)

        lines = {item.package_kind: item for item in order.items.all()}
        self.assertEqual(set(lines), {"with_light_rig", "whole"})
        self.assertEqual(lines["with_light_rig"].purchase_price, Decimal("15.00"))
        self.assertEqual(lines["whole"].title, "Oak Chair - Whole File")
        self.assertEqual(order.total_amount, Decimal("35.00"))
        # Stripe shows each line by its title, with the package label.
        names = [
            line["price_data"]["product_data"]["name"]
            for line in CheckoutService._request_payload(order, self.buyer)["line_items"]
        ]
        self.assertEqual(sorted(names), ["Oak Chair - Whole File", "Oak Chair - With Light Rig"])

    def test_checkout_buys_only_the_selected_package_lines(self) -> None:
        self.add("with_light_rig")
        self.add("glb_only")

        order = OrderService.create_from_cart(self.buyer, selected={("product", self.chair.pk, "glb_only")})

        self.assertEqual([item.package_kind for item in order.items.all()], ["glb_only"])
        self.assertEqual(CartItem.objects.count(), 2)

    def test_a_package_owned_meanwhile_is_dropped_from_the_cart(self) -> None:
        self.add("with_light_rig")
        self.add("glb_only")
        self.buy("with_light_rig")

        order = OrderService.create_from_cart(self.buyer)

        self.assertEqual([item.package_kind for item in order.items.all()], ["glb_only"])
        self.assertFalse(CartItem.objects.filter(package_kind="with_light_rig").exists())

    def test_an_admin_order_names_the_package_of_each_model_line(self) -> None:
        order = OrderService.create(
            OrderCreateData(
                user_id=self.buyer.pk,
                items=(OrderItemCreateData("product", self.chair.pk, 1, package_kind="glb_only"),),
            )
        )
        item = order.items.get()
        self.assertEqual((item.package_kind, item.purchase_price, item.title), ("glb_only", Decimal("10.00"), "Oak Chair - GLB Only"))

        for kind in ("", "environment"):
            with self.subTest(kind=kind), self.assertRaises(OrderError):
                OrderService.create(
                    OrderCreateData(user_id=self.buyer.pk, items=(OrderItemCreateData("product", self.chair.pk, 1, package_kind=kind),))
                )


@patch("downloads.services.resolve_private_download", return_value=SIGNED)
class DownloadTests(PackageSellingTestBase):
    def entitlement(self) -> dict:
        response = self.client.get(reverse("downloads:download-entitlements"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return next(row for row in response.data if row["product_id"] == str(self.chair.pk))

    def download(self, file_row: ProductFile):
        return self.client.get(
            reverse("downloads:product-file-download", kwargs={"product_id": self.chair.pk, "file_id": file_row.pk})
        )

    def test_my_downloads_lists_only_the_packages_bought(self, _resolve) -> None:
        self.buy("with_light_rig")

        entry = self.entitlement()

        self.assertEqual(entry["package_kinds"], ["with_light_rig"])
        self.assertEqual([(f["package_kind"], f["package_label"]) for f in entry["files"]], [("with_light_rig", "With Light Rig")])

    def test_whole_file_lists_every_package_and_the_older_files(self, _resolve) -> None:
        self.buy("whole")

        entry = self.entitlement()

        self.assertEqual(
            [f["package_kind"] for f in entry["files"]],
            ["with_light_rig", "glb_only", "environment", "whole", ""],
        )

    def test_only_an_owned_package_can_be_downloaded(self, _resolve) -> None:
        self.buy("with_light_rig")

        self.assertEqual(self.download(self.rig).status_code, status.HTTP_200_OK)
        for other in (self.glb, self.whole, self.extra):
            with self.subTest(file=other.file_name):
                self.assertEqual(self.download(other).status_code, status.HTTP_404_NOT_FOUND)

    def test_an_order_line_lists_the_files_of_its_package(self, _resolve) -> None:
        files = DownloadService.list_downloadable_files_for_items(
            [("product", self.chair.pk, "glb_only"), ("product", self.chair.pk, "")]
        )
        self.assertEqual([ref.file_id for ref in files[("product", self.chair.pk, "glb_only")]], [self.glb.pk])
        self.assertEqual(len(files[("product", self.chair.pk, "")]), 5)

    def test_the_download_history_names_the_package(self, _resolve) -> None:
        self.buy("glb_only")
        self.download(self.glb)

        history = self.client.get(reverse("downloads:download-history")).data["results"]

        self.assertEqual(history[0]["package_label"], "GLB Only")


class FreeDownloadTests(PackageSellingTestBase):
    def setUp(self) -> None:
        super().setUp()
        self.free = Product.objects.create(
            category=self.category, name="Free Lamp", slug="free-lamp", price=Decimal("0.00"),
            status=Product.Status.PUBLISHED,
        )
        for kind in ("glb_only", "whole"):
            package = sell_package(self.free, kind, "0.00")
            ProductFile.objects.filter(pk=package.pk).update(storage_path=f"free-models/FREE-1/FREE-1_{kind}.zip")

    def free_download(self, query: str = ""):
        return self.client.get(reverse("products:product-free-download", kwargs={"slug": "free-lamp"}) + query)

    def test_package_picks_the_zip_and_the_default_is_the_first_in_package_order(self) -> None:
        self.assertTrue(self.free_download("?package=whole")["Location"].endswith("FREE-1_whole.zip"))
        self.assertTrue(self.free_download()["Location"].endswith("FREE-1_glb_only.zip"))

    def test_an_unknown_or_missing_package_is_not_found(self) -> None:
        for query in ("?package=other", "?package=with_light_rig", "?package="):
            with self.subTest(query=query):
                self.assertEqual(self.free_download(query).status_code, status.HTTP_404_NOT_FOUND)

    def test_a_paid_model_at_price_zero_is_not_a_free_download(self) -> None:
        """A live paid model whose summary price fell to 0 (all prices removed) keeps its
        private zips private: price 0 alone never makes a model free."""
        paid = Product.objects.create(
            category=self.category, name="Paid Lamp", slug="paid-lamp", price=Decimal("0.00"),
            status=Product.Status.PUBLISHED,
        )
        sell_package(paid, "whole", "0.00")  # private products/files/ zip
        unpriced = sell_package(paid, "glb_only", "0.00")
        ProductFile.objects.filter(pk=unpriced.pk).update(price=None)

        for query in ("", "?package=whole", "?package=glb_only"):
            with self.subTest(query=query):
                response = self.client.get(
                    reverse("products:product-free-download", kwargs={"slug": "paid-lamp"}) + query
                )
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_private_zip_of_a_free_model_is_never_handed_out(self) -> None:
        """Older free models kept their zip in the private bucket; only free-models/ is served."""
        private = sell_package(self.free, "with_light_rig", "0.00")
        self.assertFalse(private.storage_path.startswith("free-models/"))

        self.assertEqual(
            self.free_download("?package=with_light_rig").status_code, status.HTTP_404_NOT_FOUND
        )
        self.assertTrue(self.free_download("?package=whole")["Location"].endswith("FREE-1_whole.zip"))

    def test_a_priced_package_of_a_free_model_is_not_served(self) -> None:
        ProductFile.objects.filter(product=self.free, package_kind="whole").update(price=Decimal("5.00"))

        self.assertEqual(self.free_download("?package=whole").status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(self.free_download()["Location"].endswith("FREE-1_glb_only.zip"))


class StorefrontTests(PackageSellingTestBase):
    def test_the_product_page_lists_the_priced_packages_in_package_order(self) -> None:
        self.client.force_authenticate(None)
        data = self.client.get(reverse("products:product-detail", kwargs={"slug": "oak-chair"})).data

        self.assertEqual([p["kind"] for p in data["packages"]], ["with_light_rig", "glb_only", "whole"])
        rig = data["packages"][0]
        self.assertEqual((rig["label"], rig["price"], rig["effective_price"]), ("With Light Rig", "15.00", "15.00"))
        self.assertTrue(rig["description"])
        # Whole File (20) against 15 + 10 bought apart.
        self.assertEqual(data["bundle_saving"], "5.00")

    def test_no_bundle_saving_without_whole_file_or_without_another_package(self) -> None:
        ProductFile.objects.filter(pk__in=[self.rig.pk, self.glb.pk]).update(price=None)
        data = self.client.get(reverse("products:product-detail", kwargs={"slug": "oak-chair"})).data
        self.assertEqual([p["kind"] for p in data["packages"]], ["whole"])
        self.assertIsNone(data["bundle_saving"])

    def test_cards_show_the_lowest_price_only_with_several_packages(self) -> None:
        ProductFile.objects.filter(pk=self.glb.pk).update(discount_price=Decimal("7.00"))
        lone = Product.objects.create(
            category=self.category, name="Desk", slug="desk", price=Decimal("30.00"), status=Product.Status.PUBLISHED
        )
        sell_package(lone, "whole")

        rows = {row["slug"]: row for row in self.client.get(reverse("products:product-list")).data["results"]}

        self.assertEqual(rows["oak-chair"]["price_from"], "7.00")
        self.assertIsNone(rows["desk"]["price_from"])
