from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from zipfile import ZipFile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from downloads.models import DownloadHistory
from orders.models import Order
from orders.services import OrderCreateData, OrderItemCreateData, OrderService
from plugins.models import Plugin, PluginCategory, PluginFile
from products.models import Product, ProductFile
from config.media import media_relative_path


class DownloadAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.password = "StrongPass123!"

        self.customer = User.objects.create_user(
            email="download-customer@example.com",
            full_name="Download Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="download-other@example.com",
            full_name="Download Other",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin = User.objects.create_user(
            email="download-admin@example.com",
            full_name="Download Admin",
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

        self.entitlements_url = reverse("downloads:download-entitlements")
        self.history_url = reverse("downloads:download-history")
        self.admin_history_url = reverse("downloads_admin:admin-download-history")
        self.login_url = reverse("accounts:login")
        self.admin_login_url = reverse("accounts:admin-login")
        self.admin_product_files_url = reverse(
            "products_admin:admin-product-files",
            kwargs={"product_id": self.product.pk},
        )
        self.admin_plugin_files_url = reverse(
            "plugins_admin:admin-plugin-files",
            kwargs={"plugin_id": self.plugin.pk},
        )

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

    def _upload_product_file(self, *, name: str = "package.zip", is_preview: bool = False) -> ProductFile:
        self.authenticate_admin()
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF")
        content = buffer.getvalue()
        mime = "application/zip"
        if name.endswith(".glb"):
            from products.test_products import make_glb_bytes

            content = make_glb_bytes()
            mime = "model/gltf-binary"
        response = self.client.post(
            self.admin_product_files_url,
            {
          "file": SimpleUploadedFile(
                    name,
                    content,
                    content_type=mime,
                ),
                "version": "1.0",
                "is_preview": is_preview,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return ProductFile.objects.get(pk=response.data["id"])

    def _upload_plugin_file(self, *, name: str = "plugin.zip") -> PluginFile:
        self.authenticate_admin()
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("plugin.bin", b"plugin")
        response = self.client.post(
            self.admin_plugin_files_url,
            {
                "file": SimpleUploadedFile(
                    name,
                    buffer.getvalue(),
                    content_type="application/zip",
                ),
                "version": "1.0",
                "is_primary": True,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return PluginFile.objects.get(pk=response.data["id"])

    def test_unauthenticated_download_returns_401(self) -> None:
        product_file = ProductFile.objects.create(
            product=self.product,
            file_name="package.zip",
            file_format="zip",
            file_size=128,
            storage_path=(
                f"http://127.0.0.1:8000/media/products/files/{self.product.pk}/package.zip"
            ),
            is_preview=False,
        )
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.client.credentials()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_owner_download_returns_404(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate(self.other_customer)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pending_order_cannot_download(self) -> None:
        product_file = self._upload_product_file()
        OrderService.create(
            OrderCreateData(
                user_id=self.customer.pk,
                items=(
                    OrderItemCreateData(
                        product_type="product",
                        product_id=self.product.pk,
                        quantity=1,
                    ),
                ),
                currency="USD",
            )
        )
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_order_paid_payment_pending_cannot_download(self) -> None:
        product_file = self._upload_product_file()
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
                currency="USD",
            )
        )
        OrderService.update_order_status(order, Order.OrderStatus.PAID)
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_paid_owner_can_download_product_file(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content = b"".join(response.streaming_content)
        self.assertIn(b"PK", content)

    def test_paid_owner_can_download_plugin_file(self) -> None:
        plugin_file = self._upload_plugin_file()
        self.create_paid_order(
            self.customer,
            product_type="plugin",
            product_id=self.plugin.pk,
        )
        url = reverse(
            "downloads:plugin-file-download",
            kwargs={"plugin_id": self.plugin.pk, "file_id": plugin_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content = b"".join(response.streaming_content)
        self.assertIn(b"PK", content)

    def test_refunded_order_cannot_download(self) -> None:
        product_file = self._upload_product_file()
        order = self.create_paid_order(self.customer)
        OrderService.update_order_status(order, Order.OrderStatus.REFUNDED)
        OrderService.update_payment_status(order, Order.PaymentStatus.REFUNDED)
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_storage_file_returns_404(self) -> None:
        product_file = ProductFile.objects.create(
            product=self.product,
            file_name="ghost.zip",
            file_format="zip",
            file_size=12,
            storage_path=(
                f"http://127.0.0.1:8000/media/products/files/{self.product.pk}/missing.zip"
            ),
            is_preview=False,
        )
        self.create_paid_order(self.customer)
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_download_records_history_and_increments_total(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        self.product.refresh_from_db()
        self.assertEqual(self.product.total_downloads, 0)
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(DownloadHistory.objects.count(), 1)
        history = DownloadHistory.objects.get()
        self.assertEqual(history.user_id, self.customer.pk)
        self.assertEqual(history.file_id, product_file.pk)
        self.assertEqual(history.file_name, product_file.file_name)
        self.product.refresh_from_db()
        self.assertEqual(self.product.total_downloads, 1)

    def test_entitlements_list_for_paid_owner(self) -> None:
        product_file = self._upload_product_file()
        preview_file = self._upload_product_file(name="preview.glb", is_preview=True)
        plugin_file = self._upload_plugin_file()
        self.create_paid_order(self.customer)
        self.create_paid_order(
            self.customer,
            product_type="plugin",
            product_id=self.plugin.pk,
        )
        self.authenticate()
        response = self.client.get(self.entitlements_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        product_entry = next(item for item in response.data if item["product_type"] == "product")
        self.assertEqual(product_entry["title"], "Oak Chair")
        self.assertEqual(len(product_entry["files"]), 1)
        self.assertEqual(str(product_entry["files"][0]["id"]), str(product_file.pk))
        self.assertNotEqual(str(product_entry["files"][0]["id"]), str(preview_file.pk))
        self.assertIn("/download/", product_entry["files"][0]["download_url"])
        self.assertNotIn("storage_path", product_entry["files"][0])

    def test_entitlements_dedupe_duplicate_orders(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        self.create_paid_order(self.customer)
        self.authenticate()
        response = self.client.get(self.entitlements_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(len(response.data[0]["files"]), 1)
        self.assertEqual(str(response.data[0]["files"][0]["id"]), str(product_file.pk))

    def _preview_download_url(self, preview_file: ProductFile) -> str:
        return reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": preview_file.pk},
        )

    def test_glb_only_product_exposes_preview_to_paid_owner(self) -> None:
        preview_file = self._upload_product_file(name="model.glb")
        self.assertTrue(preview_file.is_preview)
        self.create_paid_order(self.customer)
        self.authenticate()

        entitlements = self.client.get(self.entitlements_url)
        self.assertEqual(entitlements.status_code, status.HTTP_200_OK)
        self.assertEqual(len(entitlements.data), 1)
        files = entitlements.data[0]["files"]
        self.assertEqual([str(f["id"]) for f in files], [str(preview_file.pk)])
        self.assertNotIn("storage_path", files[0])

        response = self.client.get(self._preview_download_url(preview_file))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content = b"".join(response.streaming_content)
        self.assertTrue(content.startswith(b"glTF"))
        self.assertIn("attachment", response["Content-Disposition"])
        history = DownloadHistory.objects.get()
        self.assertEqual(history.file_id, preview_file.pk)

    def test_glb_only_preview_non_owner_returns_404(self) -> None:
        preview_file = self._upload_product_file(name="model.glb")
        self.create_paid_order(self.customer)
        self.authenticate(self.other_customer)
        response = self.client.get(self._preview_download_url(preview_file))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(DownloadHistory.objects.count(), 0)

    def test_glb_only_preview_unpaid_order_returns_404(self) -> None:
        preview_file = self._upload_product_file(name="model.glb")
        OrderService.create(
            OrderCreateData(
                user_id=self.customer.pk,
                items=(
                    OrderItemCreateData(
                        product_type="product",
                        product_id=self.product.pk,
                        quantity=1,
                    ),
                ),
                currency="USD",
            )
        )
        self.authenticate()
        response = self.client.get(self._preview_download_url(preview_file))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_preview_not_downloadable_when_package_exists(self) -> None:
        package_file = self._upload_product_file()
        preview_file = self._upload_product_file(name="model.glb")
        self.create_paid_order(self.customer)
        self.authenticate()
        response = self.client.get(self._preview_download_url(preview_file))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        detail = self.client.get(
            reverse("orders:order-detail", kwargs={"order_id": Order.objects.get().pk})
        )
        file_ids = [str(f["id"]) for f in detail.data["items"][0]["files"]]
        self.assertEqual(file_ids, [str(package_file.pk)])

    def test_order_detail_includes_glb_fallback_file(self) -> None:
        preview_file = self._upload_product_file(name="model.glb")
        order = self.create_paid_order(self.customer)
        self.authenticate()
        response = self.client.get(
            reverse("orders:order-detail", kwargs={"order_id": order.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["items"][0]
        self.assertTrue(item["can_download"])
        self.assertEqual([str(f["id"]) for f in item["files"]], [str(preview_file.pk)])
        self.assertIn("/download/", item["files"][0]["download_url"])

    def test_preview_fallback_rejects_non_preview_storage_prefix(self) -> None:
        preview_file = ProductFile.objects.create(
            product=self.product,
            file_name="model.glb",
            file_format="glb",
            file_size=12,
            storage_path=f"products/files/{self.product.pk}/model.glb",
            is_preview=True,
        )
        self.create_paid_order(self.customer)
        self.authenticate()
        response = self.client.get(self._preview_download_url(preview_file))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(DownloadHistory.objects.count(), 0)

    @override_settings(R2_ENABLED=True, R2_SIGNED_URL_EXPIRY=300)
    @patch("config.media.generate_public_presigned_url")
    @patch("config.media.get_public_storage")
    def test_glb_only_owner_receives_signed_json_from_public_bucket(
        self,
        mock_get_public_storage,
        mock_presign,
    ) -> None:
        preview_file = ProductFile.objects.create(
            product=self.product,
            file_name="model.glb",
            file_format="glb",
            file_size=12,
            storage_path=f"products/previews/{self.product.pk}/model.glb",
            is_preview=True,
        )
        self.create_paid_order(self.customer)
        mock_get_public_storage.return_value.exists.return_value = True
        mock_presign.return_value = "https://acc.r2.cloudflarestorage.com/pub/model.glb?X-Amz-Signature=t"
        self.authenticate()
        response = self.client.get(self._preview_download_url(preview_file))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["download_url"], mock_presign.return_value)
        self.assertEqual(response.data["expires_in"], 300)
        self.assertEqual(response.data["file_name"], "model.glb")
        mock_presign.assert_called_once_with(
            f"products/previews/{self.product.pk}/model.glb", file_name="model.glb"
        )

    def test_customer_history_lists_own_downloads_only(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        self.create_paid_order(self.other_customer)
        download_url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        self.client.get(download_url)
        self.authenticate(self.other_customer)
        self.client.get(download_url)
        self.authenticate()
        response = self.client.get(self.history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["file_name"], product_file.file_name)

    def test_admin_history_lists_all_users(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        self.create_paid_order(self.other_customer)
        download_url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        self.client.get(download_url)
        self.authenticate(self.other_customer)
        self.client.get(download_url)
        self.authenticate_admin()
        response = self.client.get(self.admin_history_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_admin_history_filter_by_email(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        self.create_paid_order(self.other_customer)
        download_url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        self.client.get(download_url)
        self.authenticate(self.other_customer)
        self.client.get(download_url)
        self.authenticate_admin()
        response = self.client.get(
            self.admin_history_url,
            {"user_email": self.customer.email},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["user_email"], self.customer.email)

    def test_private_media_still_blocked_after_authenticated_download(self) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        relative = media_relative_path(product_file.storage_path)
        download_url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        ok = self.client.get(download_url)
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.client.credentials()
        public = self.client.get(f"/media/{relative}")
        self.assertEqual(public.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_order_detail_includes_download_files_when_paid(self) -> None:
        product_file = self._upload_product_file()
        order = self.create_paid_order(self.customer)
        detail_url = reverse("orders:order-detail", kwargs={"order_id": order.pk})
        self.authenticate()
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["items"][0]
        self.assertTrue(item["can_download"])
        self.assertEqual(len(item["files"]), 1)
        self.assertEqual(str(item["files"][0]["id"]), str(product_file.pk))
        self.assertIn("/download/", item["files"][0]["download_url"])
        self.assertNotIn("storage_path", item["files"][0])

    def test_customer_order_detail_hides_files_when_pending(self) -> None:
        self._upload_product_file()
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
                currency="USD",
            )
        )
        detail_url = reverse("orders:order-detail", kwargs={"order_id": order.pk})
        self.authenticate()
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["items"][0]
        self.assertFalse(item["can_download"])
        self.assertEqual(item["files"], [])

    @override_settings(R2_ENABLED=True, R2_SIGNED_URL_EXPIRY=300)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_paid_owner_receives_signed_json_when_r2_has_object(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        mock_get_private_storage.return_value.exists.return_value = True
        mock_presign.return_value = (
            "https://acc.r2.cloudflarestorage.com/3dam-private/products/files/pack.zip"
            "?X-Amz-Signature=test"
        )
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["download_url"],
            mock_presign.return_value,
        )
        self.assertEqual(response.data["expires_in"], 300)
        self.assertEqual(response.data["file_name"], product_file.file_name)
        self.assertNotIn("storage_path", response.data)
        mock_presign.assert_called_once()
        self.assertEqual(DownloadHistory.objects.count(), 1)

    @override_settings(R2_ENABLED=True)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_r2_miss_falls_back_to_local_stream(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        mock_get_private_storage.return_value.exists.return_value = False
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content = b"".join(response.streaming_content)
        self.assertIn(b"PK", content)
        mock_presign.assert_not_called()

    @override_settings(R2_ENABLED=True)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_r2_and_local_missing_returns_404_without_history(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        product_file = ProductFile.objects.create(
            product=self.product,
            file_name="ghost.zip",
            file_format="zip",
            file_size=12,
            storage_path=f"products/files/{self.product.pk}/missing.zip",
            is_preview=False,
        )
        self.create_paid_order(self.customer)
        mock_get_private_storage.return_value.exists.return_value = False
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(DownloadHistory.objects.count(), 0)
        mock_presign.assert_not_called()

    @override_settings(R2_ENABLED=True)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_non_owner_still_404_when_r2_enabled(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        product_file = self._upload_product_file()
        self.create_paid_order(self.customer)
        mock_get_private_storage.return_value.exists.return_value = True
        mock_presign.return_value = "https://example.test/signed"
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate(self.other_customer)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        mock_presign.assert_not_called()

    @override_settings(R2_ENABLED=True)
    @patch("config.media.generate_private_presigned_url")
    @patch("config.media.get_private_storage")
    def test_paid_owner_receives_signed_json_for_plugin(
        self,
        mock_get_private_storage,
        mock_presign,
    ) -> None:
        plugin_file = self._upload_plugin_file()
        self.create_paid_order(
            self.customer,
            product_type="plugin",
            product_id=self.plugin.pk,
        )
        mock_get_private_storage.return_value.exists.return_value = True
        mock_presign.return_value = "https://acc.r2.cloudflarestorage.com/plugin.zip?X-Amz-Signature=p"
        url = reverse(
            "downloads:plugin-file-download",
            kwargs={"plugin_id": self.plugin.pk, "file_id": plugin_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["download_url"], mock_presign.return_value)
        self.assertEqual(response.data["file_name"], plugin_file.file_name)
        self.assertNotIn("storage_path", response.data)

    def test_missing_file_does_not_record_history(self) -> None:
        product_file = ProductFile.objects.create(
            product=self.product,
            file_name="ghost.zip",
            file_format="zip",
            file_size=12,
            storage_path=(
                f"http://127.0.0.1:8000/media/products/files/{self.product.pk}/missing.zip"
            ),
            is_preview=False,
        )
        self.create_paid_order(self.customer)
        url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": self.product.pk, "file_id": product_file.pk},
        )
        self.authenticate()
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(DownloadHistory.objects.count(), 0)
