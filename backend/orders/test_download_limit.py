"""Downloads per purchase: each paid line gives DOWNLOADS_PER_PURCHASE signed links, then the
buyer pays again for more. Free items are not counted (they never go through an order)."""

from decimal import Decimal
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status

from cart.models import CartItem
from downloads.models import DownloadHistory
from orders.entitlements import owned_package_kinds, user_owns_catalog_item
from orders.models import Order, OrderItem
from orders.services import OrderError, OrderService
from plugins.models import Plugin, PluginCategory, PluginFile
from products.models import Product, ProductFile
from products.packages import sync_summary_price
from products.testing import sell_package

from orders.test_package_selling import SIGNED, PackageSellingTestBase


@override_settings(DOWNLOADS_PER_PURCHASE=2)
@patch("downloads.services.resolve_private_download", return_value=SIGNED)
class DownloadLimitTests(PackageSellingTestBase):
    def download(self, file_row: ProductFile, line: OrderItem | None = None):
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.chair.pk, "file_id": file_row.pk},
        )
        return self.client.get(url, {"line": str(line.pk)} if line else {})

    def entitlement(self) -> dict:
        response = self.client.get(reverse("downloads:download-entitlements"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return next(row for row in response.data if row["product_id"] == str(self.chair.pk))

    def test_each_link_counts_and_the_purchase_stops_at_the_limit(self, resolve) -> None:
        line = self.buy("with_light_rig").items.get()

        self.assertEqual(self.download(self.rig).status_code, status.HTTP_200_OK)
        self.assertEqual(self.download(self.rig).status_code, status.HTTP_200_OK)
        refused = self.download(self.rig)

        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refused.data["detail"].code, "downloads_used_up")
        self.assertIn("Buy it again", str(refused.data["detail"]))
        # No link is made once the downloads are used up.
        self.assertEqual(resolve.call_count, 2)
        line.refresh_from_db()
        self.assertEqual(line.downloads_used, 2)
        self.assertEqual(
            list(DownloadHistory.objects.values_list("order_item_id", flat=True)), [line.pk, line.pk]
        )

    def test_the_library_shows_downloads_left_and_keeps_a_used_up_item(self, _resolve) -> None:
        self.buy("with_light_rig")
        self.assertEqual(self.entitlement()["files"][0]["downloads_left"], 2)

        self.download(self.rig)
        self.assertEqual(self.entitlement()["files"][0]["downloads_left"], 1)
        self.assertTrue(self.entitlement()["has_downloads_left"])

        self.download(self.rig)
        entry = self.entitlement()
        self.assertEqual(entry["files"][0]["downloads_left"], 0)
        self.assertFalse(entry["has_downloads_left"])
        # Used up: no longer owned, so the product page offers it for sale again.
        self.assertEqual(entry["package_kinds"], [])

    def test_a_used_up_package_is_not_owned_but_the_buyer_can_still_review(self, _resolve) -> None:
        self.buy("with_light_rig")
        self.download(self.rig)
        self.download(self.rig)

        self.assertEqual(owned_package_kinds(self.buyer, [self.chair.pk]), {})
        self.assertTrue(user_owns_catalog_item(self.buyer, "product", self.chair.pk))

    def test_a_used_up_package_can_be_added_to_the_cart_again(self, _resolve) -> None:
        self.buy("with_light_rig")
        refused = self.add("with_light_rig")
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already own", str(refused.data))

        self.download(self.rig)
        self.download(self.rig)

        self.assertEqual(self.add("with_light_rig").status_code, status.HTTP_201_CREATED)

    def test_buying_again_gives_new_downloads(self, _resolve) -> None:
        old = self.buy("with_light_rig").items.get()
        self.download(self.rig)
        self.download(self.rig)

        new = self.buy("with_light_rig").items.get()

        self.assertEqual(self.download(self.rig).status_code, status.HTTP_200_OK)
        old.refresh_from_db()
        new.refresh_from_db()
        self.assertEqual((old.downloads_used, new.downloads_used), (2, 1))
        self.assertEqual(self.entitlement()["files"][0]["downloads_left"], 1)

    def test_the_order_page_link_counts_against_its_own_line(self, _resolve) -> None:
        first = self.buy("with_light_rig").items.get()
        second = self.buy("with_light_rig").items.get()

        self.assertEqual(self.download(self.rig, line=first).status_code, status.HTTP_200_OK)

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual((first.downloads_used, second.downloads_used), (1, 0))

    def test_a_line_of_another_package_or_buyer_is_not_found(self, _resolve) -> None:
        glb_line = self.buy("glb_only").items.get()
        self.buy("with_light_rig")

        # The GLB Only line does not give the light rig zip.
        self.assertEqual(self.download(self.rig, line=glb_line).status_code, status.HTTP_404_NOT_FOUND)
        glb_line.refresh_from_db()
        self.assertEqual(glb_line.downloads_used, 0)

    def test_all_variations_counts_its_whole_file_downloads(self, _resolve) -> None:
        line = self.buy("bundle").items.get()

        self.download(self.whole)
        self.download(self.whole)

        self.assertEqual(self.download(self.whole).status_code, status.HTTP_403_FORBIDDEN)
        line.refresh_from_db()
        self.assertEqual(line.downloads_used, 2)

    def test_a_missing_file_uses_no_download(self, resolve) -> None:
        from config.media import PrivateFileNotFound

        line = self.buy("with_light_rig").items.get()
        resolve.side_effect = PrivateFileNotFound("gone")

        self.assertEqual(self.download(self.rig).status_code, status.HTTP_404_NOT_FOUND)
        line.refresh_from_db()
        self.assertEqual(line.downloads_used, 0)
        self.assertFalse(DownloadHistory.objects.exists())

    def test_the_order_page_shows_downloads_left_and_used_up(self, _resolve) -> None:
        order = self.buy("with_light_rig")
        detail_url = reverse("orders:order-detail", kwargs={"order_id": order.pk})

        item = self.client.get(detail_url).data["items"][0]
        self.assertEqual((item["downloads_left"], item["downloads_limit"]), (2, 2))
        self.assertFalse(item["downloads_used_up"])
        self.assertIn(f"?line={item['id']}", item["files"][0]["download_url"])

        self.download(self.rig)
        self.download(self.rig)

        item = self.client.get(detail_url).data["items"][0]
        self.assertFalse(item["can_download"])
        self.assertTrue(item["downloads_used_up"])
        self.assertEqual((item["downloads_left"], item["files"]), (0, []))

    def test_an_unpaid_order_is_not_used_up(self, _resolve) -> None:
        order = self.buy("with_light_rig", paid=False)
        item = self.client.get(reverse("orders:order-detail", kwargs={"order_id": order.pk})).data["items"][0]

        self.assertFalse(item["can_download"])
        self.assertFalse(item["downloads_used_up"])

    def test_a_plugin_purchase_has_the_same_limit(self, resolve) -> None:
        plugin = Plugin.objects.create(
            category=PluginCategory.objects.create(name="Tools", slug="tools", is_active=True),
            name="UV Tool",
            slug="uv-tool",
            price=Decimal("9.00"),
            status=Plugin.Status.PUBLISHED,
        )
        plugin_file = PluginFile.objects.create(
            plugin=plugin,
            file_name="uv-tool.zip",
            file_format="zip",
            file_size=10,
            storage_path="plugins/files/uv-tool.zip",
            version="1.0",
            is_primary=True,
        )
        order = Order.objects.create(
            user=self.buyer,
            invoice_number="INV-PLUGIN-LIMIT",
            total_amount=Decimal("9.00"),
            order_status=Order.OrderStatus.PAID,
            payment_status=Order.PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PLUGIN,
            product_id=plugin.pk,
            quantity=1,
            purchase_price=Decimal("9.00"),
        )
        url = reverse("downloads:plugin-file-download", kwargs={"plugin_id": plugin.pk, "file_id": plugin_file.pk})

        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

        cart = self.client.post(
            self.cart_url, {"product_type": "plugin", "product_id": str(plugin.pk)}, format="json"
        )
        self.assertEqual(cart.status_code, status.HTTP_201_CREATED, cart.data)


@override_settings(DOWNLOADS_PER_PURCHASE=5)
class DownloadLimitSettingTests(PackageSellingTestBase):
    def test_a_new_purchase_starts_with_the_configured_downloads(self) -> None:
        line = self.buy("with_light_rig").items.get()
        self.assertEqual(line.downloads_used, 0)
        entry = self.client.get(reverse("downloads:download-entitlements")).data[0]
        self.assertEqual(entry["files"][0]["downloads_left"], 5)


class OneModelPerCheckoutTests(PackageSellingTestBase):
    def setUp(self) -> None:
        super().setUp()
        self.lamp = Product.objects.create(
            category=self.category,
            name="Desk Lamp",
            slug="desk-lamp",
            price=Decimal("0.00"),
            status=Product.Status.PUBLISHED,
        )
        sell_package(self.lamp, "glb_only", "8.00")
        sync_summary_price(self.lamp)

    def add_ok(self, kind: str, product: Product | None = None) -> None:
        response = self.add(kind, product=product)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_two_models_in_one_checkout_are_refused(self) -> None:
        self.add_ok("with_light_rig")
        self.add_ok("glb_only", product=self.lamp)

        with self.assertRaises(OrderError) as raised:
            OrderService.create_from_cart(self.buyer)
        self.assertIn("one model", raised.exception.message)
        self.assertFalse(Order.objects.exists())

    def test_the_variations_of_one_model_check_out_together(self) -> None:
        self.add_ok("with_light_rig")
        self.add_ok("glb_only")
        self.add_ok("glb_only", product=self.lamp)

        order = OrderService.create_from_cart(
            self.buyer,
            selected={("product", self.chair.pk, "with_light_rig"), ("product", self.chair.pk, "glb_only")},
        )

        self.assertEqual(
            sorted(item.package_kind for item in order.items.all()), ["glb_only", "with_light_rig"]
        )
        # The other model waits in the cart.
        self.assertTrue(CartItem.objects.filter(product_id=self.lamp.pk).exists())
