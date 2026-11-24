"""Moving the public bucket to a new address: old saved addresses still count as the site's own
files, and rewrite_public_media_host moves them to the new address."""

from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from accounts.models import Role, User
from categories.models import Category
from config.media import media_relative_path, public_base_urls
from products.file_check import _is_our_url
from products.management.commands.rewrite_public_media_host import rewrite_address
from products.models import Product, ProductFile, ProductImage

OLD = "https://pub-old.r2.dev"
NEW = "https://media.example.com"
BOTH = {"R2_PUBLIC_BASE_URL": NEW, "R2_PUBLIC_BASE_URL_PREVIOUS": OLD}


class PublicBaseTests(TestCase):
    @override_settings(**BOTH)
    def test_old_and_new_addresses_both_resolve_to_the_object_key(self) -> None:
        for base in (OLD, NEW):
            with self.subTest(base=base):
                self.assertEqual(
                    media_relative_path(f"{base}/models/X-1/previewthumb_X-1.jpg?v=abc123"),
                    "models/X-1/previewthumb_X-1.jpg",
                )
                self.assertTrue(_is_our_url(f"{base}/models/X-1/preview_X-1.glb"))
        self.assertEqual(public_base_urls(), (NEW, OLD))

    @override_settings(R2_PUBLIC_BASE_URL=NEW, R2_PUBLIC_BASE_URL_PREVIOUS="")
    def test_without_a_previous_address_only_the_current_one_is_ours(self) -> None:
        self.assertEqual(public_base_urls(), (NEW,))
        self.assertFalse(_is_our_url(f"{OLD}/models/X-1/preview_X-1.glb"))

    @override_settings(**BOTH)
    def test_a_lookalike_host_is_not_ours(self) -> None:
        self.assertFalse(_is_our_url("https://media.example.com.evil.test/models/a.jpg"))
        self.assertFalse(_is_our_url("https://pub-old.r2.dev.evil.test/models/a.jpg"))

    def test_rewrite_address_keeps_the_key_and_version_tag(self) -> None:
        self.assertEqual(
            rewrite_address(f"{OLD}/models/X-1/a.jpg?v=abc", OLD, NEW),
            f"{NEW}/models/X-1/a.jpg?v=abc",
        )
        for untouched in ("", "models/X-1/a.zip", "https://elsewhere.test/a.jpg", f"{OLD}.evil/a"):
            with self.subTest(value=untouched):
                self.assertEqual(rewrite_address(untouched, OLD, NEW), untouched)


@override_settings(**BOTH)
class RewritePublicMediaHostCommandTests(TestCase):
    def setUp(self) -> None:
        category = Category.objects.create(
            name="Props", slug="props", image=f"{OLD}/categories/props.jpg"
        )
        self.product = Product.objects.create(
            category=category,
            name="Lamp",
            slug="lamp",
            price="9.00",
            status=Product.Status.PUBLISHED,
            thumbnail=f"{OLD}/models/L-1/previewthumb_L-1.jpg?v=111111111111",
            preview_model=f"{OLD}/models/L-1/preview_L-1.glb?v=222222222222",
            spin_images=[f"{OLD}/360/L-1/360_L-1_01.jpg", "https://elsewhere.test/x.jpg"],
        )
        self.image = ProductImage.objects.create(
            product=self.product, image_url=f"{OLD}/models/L-1/gallery_1.jpg"
        )
        self.private = ProductFile.objects.create(
            product=self.product,
            file_name="L-1_whole.zip",
            file_format="zip",
            file_size=10,
            storage_path="models/L-1/L-1_whole.zip",
            package_kind="whole",
        )
        self.user = User.objects.create_user(
            email="avatar@example.com",
            full_name="Avatar Person",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Customer"),
            country="India",
        )
        User.objects.filter(pk=self.user.pk).update(avatar=f"{OLD}/avatars/a.jpg")

    def _run(self, *args: str) -> str:
        out = StringIO()
        call_command("rewrite_public_media_host", *args, stdout=out)
        return out.getvalue()

    def test_without_execute_it_only_counts(self) -> None:
        output = self._run()

        self.assertIn("Product.thumbnail: 1", output)
        self.assertIn("Product.spin_images: 1", output)
        self.assertIn("would change", output)
        self.product.refresh_from_db()
        self.assertTrue(self.product.thumbnail.startswith(OLD))

    def test_execute_moves_every_saved_address_and_keeps_the_rest(self) -> None:
        self._run("--execute")

        self.product.refresh_from_db()
        self.image.refresh_from_db()
        self.private.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(self.product.thumbnail, f"{NEW}/models/L-1/previewthumb_L-1.jpg?v=111111111111")
        self.assertEqual(self.product.preview_model, f"{NEW}/models/L-1/preview_L-1.glb?v=222222222222")
        self.assertEqual(
            self.product.spin_images,
            [f"{NEW}/360/L-1/360_L-1_01.jpg", "https://elsewhere.test/x.jpg"],
        )
        self.assertEqual(self.image.image_url, f"{NEW}/models/L-1/gallery_1.jpg")
        self.assertEqual(self.product.category.image, f"{NEW}/categories/props.jpg")
        self.assertEqual(self.user.avatar, f"{NEW}/avatars/a.jpg")
        # A private package key is not an address and is left alone.
        self.assertEqual(self.private.storage_path, "models/L-1/L-1_whole.zip")

    def test_a_second_run_finds_nothing_left(self) -> None:
        self._run("--execute")

        self.assertIn("Nothing left on the old address", self._run())

    def test_refuses_without_both_addresses(self) -> None:
        for settings_ in (
            {"R2_PUBLIC_BASE_URL_PREVIOUS": ""},
            {"R2_PUBLIC_BASE_URL": ""},
            {"R2_PUBLIC_BASE_URL_PREVIOUS": NEW},
            {"R2_PUBLIC_BASE_URL_PREVIOUS": "http://pub-old.r2.dev"},
        ):
            with self.subTest(settings=settings_), override_settings(**settings_):
                with self.assertRaises(CommandError):
                    self._run("--execute")
        self.product.refresh_from_db()
        self.assertTrue(self.product.thumbnail.startswith(OLD))
