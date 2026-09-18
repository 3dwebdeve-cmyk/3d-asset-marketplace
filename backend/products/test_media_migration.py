from pathlib import Path
import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings

from accounts.models import Role, User
from categories.models import Category
from config.media import is_public_media_path
from config.media_migration import LocalMediaMigrationService, MediaMigrationError
from config.storages import get_private_storage, get_public_storage
from custom_projects.models import CustomProject, ProjectDelivery, ProjectFile
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

    def test_copies_custom_project_private_prefixes(self) -> None:
        customer_role = Role.objects.get(role_name="Customer")
        customer = User.objects.create_user(
            email="migrate-cp@example.com",
            full_name="Migrate CP",
            password="StrongPass123!",
            role=customer_role,
            email_verified=True,
        )
        project = CustomProject.objects.create(
            customer=customer,
            title="Migrate project",
            description="Private file migration coverage.",
            status=CustomProject.Status.IN_PROGRESS,
        )
        ref_key = "custom_projects/files/migrate-ref.png"
        delivery_key = "custom_projects/deliveries/migrate-pack.zip"
        default_storage.save(ref_key, ContentFile(b"ref-bytes"))
        default_storage.save(delivery_key, ContentFile(b"zip-bytes"))
        ProjectFile.objects.create(
            project=project,
            uploaded_by=customer,
            file_name="migrate-ref.png",
            file_type=ProjectFile.FileType.REFERENCE_IMAGE,
            storage_path=ref_key,
            file_size=9,
        )
        ProjectDelivery.objects.create(
            project=project,
            uploaded_by=customer,
            version=1,
            file_name="migrate-pack.zip",
            storage_path=delivery_key,
            file_size=9,
        )

        self.assertFalse(is_public_media_path(ref_key))
        self.assertFalse(is_public_media_path(delivery_key))
        self.assertFalse(is_public_media_path("custom_projects/messages/x.bin"))

        with override_settings(
            R2_ENABLED=True,
            R2_PUBLIC_BASE_URL="https://pub-test.r2.dev",
            STORAGES=_storages(self.public_dir, self.private_dir),
        ):
            stats = LocalMediaMigrationService.migrate(dry_run=False)
            self.assertGreaterEqual(stats.copied, 2)
            private = get_private_storage()
            self.assertTrue(private.exists(ref_key))
            self.assertTrue(private.exists(delivery_key))
            self.assertTrue(Path(self.private_dir, ref_key).is_file())
            self.assertTrue(Path(self.private_dir, delivery_key).is_file())
