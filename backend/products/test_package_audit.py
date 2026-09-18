"""Phase C — published package audit + R2 verify command tests."""

from __future__ import annotations

from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from categories.models import Category
from config.media import private_object_exists
from config.package_audit import PublishedPackageAuditService
from config.storages import R2VerificationError, verify_r2_buckets
from plugins.models import Plugin, PluginCategory, PluginFile
from products.models import Product, ProductFile


class PrivateObjectExistsTests(SimpleTestCase):
    def test_rejects_invalid_paths(self) -> None:
        self.assertFalse(private_object_exists(""))
        self.assertFalse(private_object_exists("../secret.zip"))


class PublishedPackageAuditServiceTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Audit Cat", slug="audit-cat")
        self.plugin_category = PluginCategory.objects.create(
            name="Audit Plugins",
            slug="audit-plugins",
        )

    def test_reports_published_product_without_package_row(self) -> None:
        Product.objects.create(
            category=self.category,
            name="No Package",
            slug="no-package",
            sku="AUD-001",
            price=Decimal("9.00"),
            status=Product.Status.PUBLISHED,
        )

        issues = PublishedPackageAuditService.audit()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].kind, "product")
        self.assertEqual(issues[0].reason, "no_package")
        self.assertEqual(issues[0].label, "AUD-001")

    def test_reports_published_product_with_missing_object(self) -> None:
        product = Product.objects.create(
            category=self.category,
            name="Missing Object",
            slug="missing-object",
            sku="AUD-002",
            price=Decimal("9.00"),
            status=Product.Status.PUBLISHED,
        )
        ProductFile.objects.create(
            product=product,
            file_name="package.zip",
            file_format="zip",
            file_size=10,
            storage_path="products/files/missing-audit.zip",
            is_preview=False,
        )

        issues = PublishedPackageAuditService.audit()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].reason, "missing_object")

    def test_clean_when_package_object_exists(self) -> None:
        product = Product.objects.create(
            category=self.category,
            name="Ready",
            slug="ready-audit",
            sku="AUD-003",
            price=Decimal("9.00"),
            status=Product.Status.PUBLISHED,
        )
        path = "products/files/ready-audit.zip"
        default_storage.save(path, ContentFile(b"zip-bytes"))
        ProductFile.objects.create(
            product=product,
            file_name="package.zip",
            file_format="zip",
            file_size=9,
            storage_path=path,
            is_preview=False,
        )
        plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="Ready Plugin",
            slug="ready-plugin",
            price=Decimal("5.00"),
            status=Plugin.Status.PUBLISHED,
        )
        plugin_path = "plugins/files/ready-plugin.zip"
        default_storage.save(plugin_path, ContentFile(b"zip-bytes"))
        PluginFile.objects.create(
            plugin=plugin,
            file_name="ready-plugin.zip",
            file_format="zip",
            file_size=9,
            storage_path=plugin_path,
            is_primary=True,
        )

        self.assertEqual(PublishedPackageAuditService.audit(), [])

    def test_management_command_fail_on_missing(self) -> None:
        Product.objects.create(
            category=self.category,
            name="Broken",
            slug="broken-audit",
            price=Decimal("1.00"),
            status=Product.Status.PUBLISHED,
        )
        out = StringIO()
        with self.assertRaises(CommandError):
            call_command("audit_published_packages", fail_on_missing=True, stdout=out)


class VerifyR2CommandTests(SimpleTestCase):
    @override_settings(R2_ENABLED=False)
    def test_verify_r2_buckets_requires_enabled(self) -> None:
        with self.assertRaises(R2VerificationError):
            verify_r2_buckets()

    @override_settings(R2_ENABLED=False)
    def test_verify_r2_command_fails_when_disabled(self) -> None:
        with self.assertRaises(CommandError):
            call_command("verify_r2")

    @override_settings(
        R2_ENABLED=True,
        R2_PUBLIC_BUCKET="pub-test",
        R2_PRIVATE_BUCKET="priv-test",
        R2_ENDPOINT_URL="https://example.r2.cloudflarestorage.com",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
    )
    @patch("config.storages.private_s3_client")
    def test_verify_r2_buckets_heads_both(self, mock_client_factory) -> None:
        client = mock_client_factory.return_value
        client.head_bucket.return_value = {}
        results = verify_r2_buckets()
        self.assertEqual(results, {"public": "ok", "private": "ok"})
        self.assertEqual(client.head_bucket.call_count, 2)
