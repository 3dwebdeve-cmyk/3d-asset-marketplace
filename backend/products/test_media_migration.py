from pathlib import Path
import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings

from categories.models import Category
from config.media_migration import LocalMediaMigrationService, MediaMigrationError
from config.storages import get_public_storage
from products.models import Product
from products.test_storage import _storages


class LocalMediaMigrationTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Props", slug="props")
        self.public_dir = tempfile.mkdtemp()
        self.private_dir = tempfile.mkdtemp()

    def test_requires_r2(self) -> None:
        with override_settings(R2_ENABLED=False):
            with self.assertRaises(MediaMigrationError):
                LocalMediaMigrationService.migrate()

    def test_copies_local_public_file_and_rewrites_url(self) -> None:
        key = "products/images/migrate-thumb.png"
        default_storage.save(key, ContentFile(b"png-bytes"))
        product = Product.objects.create(
            category=self.category,
            name="Migrate Prop",
            slug="migrate-prop",
            price="9.00",
            status=Product.Status.DRAFT,
            thumbnail="http://127.0.0.1:8000/media/products/images/migrate-thumb.png",
        )

        with override_settings(
            R2_ENABLED=True,
            R2_PUBLIC_BASE_URL="https://pub-test.r2.dev",
            STORAGES=_storages(self.public_dir, self.private_dir),
        ):
            stats = LocalMediaMigrationService.migrate(dry_run=False)
            self.assertGreaterEqual(stats.copied, 1)
            self.assertGreaterEqual(stats.rewritten, 1)
            product.refresh_from_db()
            self.assertEqual(
                product.thumbnail,
                "https://pub-test.r2.dev/products/images/migrate-thumb.png",
            )
            self.assertTrue(get_public_storage().exists(key))
            self.assertTrue(Path(self.public_dir, key).is_file())
