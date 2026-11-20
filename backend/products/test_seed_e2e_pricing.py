"""seed_e2e_pricing never writes its fixture zips to the real R2 buckets (docs/E2E_LOCAL.md)."""

from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from products.models import Product


class SeedE2EPricingStorageGuardTests(TestCase):
    @override_settings(DEPLOYMENT_PROFILE="test", R2_ENABLED=True)
    def test_refuses_while_r2_is_on_and_writes_nothing(self) -> None:
        with mock.patch("products.management.commands.seed_e2e_pricing.storages") as storages:
            with self.assertRaisesMessage(CommandError, "never writes to the real R2 buckets"):
                call_command("seed_e2e_pricing")
        storages.__getitem__.assert_not_called()
        self.assertFalse(Product.objects.filter(sku__startswith="PRC-").exists())

    @override_settings(DEPLOYMENT_PROFILE="production", R2_ENABLED=False)
    def test_refuses_outside_test_and_development(self) -> None:
        with self.assertRaisesMessage(CommandError, "DEPLOYMENT_PROFILE=test or development"):
            call_command("seed_e2e_pricing")
