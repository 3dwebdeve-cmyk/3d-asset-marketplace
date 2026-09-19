"""Unit tests for Phase J1 load smoke."""

from __future__ import annotations

from decimal import Decimal
from io import StringIO
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from categories.models import Category
from config.load_smoke import run_load_smoke
from products.models import Product, ProductImage


@override_settings(
    DEBUG=True,
    STRIPE_SECRET_KEY="sk_test_load_smoke_unit",
    R2_ENABLED=False,
    R2_PUBLIC_BASE_URL="",
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "load-smoke-tests",
        }
    },
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class LoadSmokeRunTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(
            name="Load Smoke Furniture",
            slug="load-smoke-furniture",
        )
        self.product = Product.objects.create(
            category=self.category,
            name="Load Smoke Oak Chair",
            slug="load-smoke-oak-chair",
            short_description="Load smoke chair",
            price=Decimal("19.99"),
            status=Product.Status.PUBLISHED,
            thumbnail=(
                "http://127.0.0.1:8000/media/products/images/oak.jpg"
            ),
            preview_model=(
                "http://127.0.0.1:8000/media/products/previews/oak.glb"
            ),
        )
        ProductImage.objects.create(
            product=self.product,
            image_url=(
                "http://127.0.0.1:8000/media/products/images/oak-g.jpg"
            ),
            display_order=0,
            is_primary=True,
        )

    def test_smoke_passes_critical_paths(self) -> None:
        fake = MagicMock()
        fake.id = "cs_test_load_1"
        fake.url = "https://checkout.stripe.com/pay/cs_test_load_1"
        with patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=fake,
        ):
            result = run_load_smoke(iterations=1)

        by_name = {c.name: c for c in result.checks}
        for name in (
            "healthz",
            "product_list",
            "product_detail",
            "search",
            "checkout_session",
        ):
            check = by_name[name]
            self.assertTrue(check.ok, msg=f"{name}: {check.detail}")
        self.assertTrue(by_name["public_cdn"].ok)
        self.assertFalse(by_name["public_cdn"].blocking)
        self.assertTrue(result.all_ok)
        self.assertTrue(
            any("R2_ENABLED=False" in w for w in result.warnings)
        )

    def test_command_prints_ok(self) -> None:
        fake = MagicMock()
        fake.id = "cs_test_load_cmd"
        fake.url = "https://checkout.stripe.com/pay/cs_test_load_cmd"
        out = StringIO()
        with patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=fake,
        ):
            call_command("check_load_smoke", stdout=out)
        text = out.getvalue()
        self.assertIn("load_smoke OK", text)
        self.assertIn("[OK] healthz", text)
        self.assertIn("[OK] product_list", text)
        self.assertIn("[OK] checkout_session", text)
        self.assertNotIn("sk_test_", text)
        self.assertNotIn("whsec_", text)

    def test_soak_iterations_report(self) -> None:
        fake = MagicMock()
        fake.id = "cs_test_load_soak"
        fake.url = "https://checkout.stripe.com/pay/cs_test_load_soak"
        with patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=fake,
        ):
            result = run_load_smoke(iterations=3)
        soak = next(c for c in result.checks if c.name == "soak")
        self.assertTrue(soak.ok, msg=soak.detail)
        self.assertIn("iterations=3", soak.detail)

    def test_detail_hides_storage_path(self) -> None:
        client_response = self.client.get(
            reverse(
                "products:product-detail",
                kwargs={"slug": self.product.slug},
            )
        )
        self.assertEqual(client_response.status_code, 200)
        self.assertNotIn("storage_path", client_response.data)


@override_settings(
    DEBUG=True,
    R2_ENABLED=True,
    R2_PUBLIC_BASE_URL="https://pub-load-smoke.r2.dev",
    STRIPE_SECRET_KEY="sk_test_load_smoke_cdn",
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "load-smoke-cdn",
        }
    },
)
class LoadSmokeCdnTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(
            name="CDN Props",
            slug="cdn-props",
        )
        base = "https://pub-load-smoke.r2.dev"
        self.product = Product.objects.create(
            category=self.category,
            name="CDN Chair",
            slug="cdn-chair",
            price=Decimal("9.99"),
            status=Product.Status.PUBLISHED,
            thumbnail=f"{base}/products/images/cdn.jpg",
            preview_model=f"{base}/products/previews/cdn.glb",
        )
        ProductImage.objects.create(
            product=self.product,
            image_url=f"{base}/products/images/cdn-g.jpg",
            display_order=0,
            is_primary=True,
        )

    def test_public_cdn_ok_when_urls_under_base(self) -> None:
        fake = MagicMock()
        fake.id = "cs_cdn_ok"
        fake.url = "https://checkout.stripe.com/pay/cs_cdn_ok"
        with patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=fake,
        ):
            result = run_load_smoke(iterations=1)
        cdn = next(c for c in result.checks if c.name == "public_cdn")
        self.assertTrue(cdn.ok, msg=cdn.detail)
        self.assertTrue(cdn.blocking)
        self.assertIn("wiring=ok", cdn.detail)

    def test_public_cdn_fails_when_url_not_under_base(self) -> None:
        self.product.thumbnail = "http://127.0.0.1:8000/media/bad.jpg"
        self.product.save(update_fields=["thumbnail", "updated_at"])
        fake = MagicMock()
        fake.id = "cs_cdn_bad"
        fake.url = "https://checkout.stripe.com/pay/cs_cdn_bad"
        with patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=fake,
        ):
            result = run_load_smoke(iterations=1)
        cdn = next(c for c in result.checks if c.name == "public_cdn")
        self.assertFalse(cdn.ok)
        self.assertFalse(result.all_ok)

    def test_public_cdn_placeholders_are_advisory(self) -> None:
        self.product.thumbnail = (
            "http://localhost:5173/images/about/offer-3d-models.jpg"
        )
        self.product.preview_model = (
            "http://localhost:5173/fixtures/e2e-preview.glb"
        )
        self.product.save(
            update_fields=["thumbnail", "preview_model", "updated_at"]
        )
        ProductImage.objects.filter(product=self.product).update(
            image_url=self.product.thumbnail
        )
        fake = MagicMock()
        fake.id = "cs_cdn_ph"
        fake.url = "https://checkout.stripe.com/pay/cs_cdn_ph"
        with patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=fake,
        ):
            result = run_load_smoke(iterations=1)
        cdn = next(c for c in result.checks if c.name == "public_cdn")
        self.assertTrue(cdn.ok, msg=cdn.detail)
        self.assertFalse(cdn.blocking)
        self.assertIn("catalog_placeholders", cdn.detail)
        self.assertTrue(result.all_ok)
        self.assertTrue(
            any("placeholder" in w.lower() for w in result.warnings)
        )


class LoadSmokeCommandFailTests(SimpleTestCase):
    def test_invalid_iterations(self) -> None:
        with self.assertRaises(CommandError):
            call_command(
                "check_load_smoke",
                iterations=0,
                stdout=StringIO(),
                stderr=StringIO(),
            )
