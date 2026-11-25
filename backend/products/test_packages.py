"""Packages foundation (docs/PACKAGES_PIPELINE.md, Phase 1): the kinds, the shared sale rules,
the summary price, the package constraints, and the 0016 migration's data step."""

from __future__ import annotations

import re
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.utils import timezone

from accounts.models import Role, User
from cart.models import Cart, CartItem
from cart.serializers import CartAddSerializer
from categories.models import Category
from orders.models import Order, OrderItem
from products.models import Product, ProductFile
from products.packages import (
    BUNDLE_KIND,
    LINE_KINDS,
    PACKAGE_DESCRIPTIONS,
    PACKAGE_KINDS,
    PACKAGE_LABELS,
    PACKAGE_ORDER,
    SINGLE_KINDS,
    PackageKind,
    sync_summary_price,
)


def _product(category: Category, **fields) -> Product:
    defaults = {"name": "Oak Chair", "slug": f"oak-chair-{Product.objects.count()}", "price": Decimal("0.00")}
    return Product.objects.create(category=category, **{**defaults, **fields})


def _package(product: Product, kind: str, price: str | None, **fields) -> ProductFile:
    return ProductFile.objects.create(
        product=product,
        file_name=f"{product.sku or 'X'}_{kind}.zip",
        file_format="zip",
        file_size=1024,
        storage_path=f"models/{product.sku or 'X'}/{product.sku or 'X'}_{kind}.zip",
        package_kind=kind,
        price=None if price is None else Decimal(price),
        **fields,
    )


class PackageKindsTests(TestCase):
    def test_every_kind_has_one_place_in_the_order_a_label_and_a_description(self) -> None:
        self.assertEqual(
            set(PACKAGE_ORDER),
            {"glb_only", "with_light_rig", "without_light_rig", "environment", "whole"},
        )
        self.assertEqual(len(PACKAGE_ORDER), len(PACKAGE_KINDS))
        # All variations is a cart and order line, not a package: it has a label and a
        # description too, and Whole File is the one kind nobody prices.
        self.assertEqual(set(PACKAGE_LABELS), PACKAGE_KINDS | {BUNDLE_KIND})
        self.assertEqual(set(PACKAGE_DESCRIPTIONS), PACKAGE_KINDS | {BUNDLE_KIND})
        self.assertEqual(PACKAGE_LABELS[PackageKind.WHOLE], "Whole File")
        self.assertEqual(PACKAGE_LABELS[BUNDLE_KIND], "All variations")
        self.assertEqual(set(SINGLE_KINDS), PACKAGE_KINDS - {"whole"})
        self.assertEqual(LINE_KINDS, (*SINGLE_KINDS, BUNDLE_KIND))


class PricedMixinTests(TestCase):
    """The same sale rules for a product and for a package."""

    def setUp(self) -> None:
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.product = _product(self.category, sku="FUR-000001", price=Decimal("20.00"))
        self.package = _package(self.product, "whole", "20.00")

    def test_a_running_sale_is_the_effective_price_and_an_ended_one_is_not(self) -> None:
        now = timezone.now()
        for row in (self.product, self.package):
            with self.subTest(row=type(row).__name__):
                row.discount_price = Decimal("15.00")
                row.discount_ends_at = now + timedelta(days=1)
                self.assertEqual(row.active_discount_price(now), Decimal("15.00"))
                self.assertEqual(row.effective_price(now), Decimal("15.00"))
                row.discount_ends_at = now - timedelta(seconds=1)
                self.assertIsNone(row.active_discount_price(now))
                self.assertEqual(row.effective_price(now), Decimal("20.00"))

    def test_a_package_with_no_price_has_no_effective_price(self) -> None:
        unpriced = _package(self.product, "glb_only", None)
        self.assertIsNone(unpriced.effective_price())


class SyncSummaryPriceTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.product = _product(self.category, sku="FUR-000002")

    def _summary(self) -> tuple:
        self.product.refresh_from_db()
        return (self.product.price, self.product.discount_price, self.product.discount_ends_at)

    def test_the_cheapest_priced_package_and_its_sale_become_the_product_price(self) -> None:
        ends = timezone.now() + timedelta(days=3)
        _package(self.product, "whole", "29.00")
        _package(self.product, "with_light_rig", "19.00", discount_price=Decimal("14.00"), discount_ends_at=ends)
        _package(self.product, "glb_only", None)
        sync_summary_price(self.product)
        self.assertEqual(self._summary(), (Decimal("19.00"), Decimal("14.00"), ends))

    def test_a_tie_goes_to_the_package_listed_first(self) -> None:
        _package(self.product, "whole", "15.00", discount_price=Decimal("10.00"))
        _package(self.product, "without_light_rig", "15.00")
        sync_summary_price(self.product)
        # without_light_rig comes before whole in PACKAGE_ORDER, and has no sale.
        self.assertEqual(self._summary(), (Decimal("15.00"), None, None))

    def test_no_priced_package_gives_zero_and_no_sale(self) -> None:
        self.product.price = Decimal("9.00")
        self.product.discount_price = Decimal("5.00")
        self.product.save()
        _package(self.product, "whole", None)
        sync_summary_price(self.product)
        self.assertEqual(self._summary(), (Decimal("0.00"), None, None))

    def test_free_packages_keep_the_product_free(self) -> None:
        _package(self.product, "whole", "0.00")
        _package(self.product, "glb_only", "0.00")
        sync_summary_price(self.product)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_free)

    def test_preview_and_kindless_files_are_ignored(self) -> None:
        ProductFile.objects.create(
            product=self.product, file_name="p.glb", file_format="glb", file_size=1,
            storage_path="models/FUR-000002/preview_FUR-000002.glb", is_preview=True,
        )
        ProductFile.objects.create(
            product=self.product, file_name="extra.fbx", file_format="fbx", file_size=1,
            storage_path="products/files/extra.fbx", price=Decimal("1.00"),
        )
        _package(self.product, "whole", "25.00")
        sync_summary_price(self.product)
        self.assertEqual(self._summary()[0], Decimal("25.00"))

    def test_an_unchanged_summary_is_not_saved_again(self) -> None:
        _package(self.product, "whole", "0.00")
        before = Product.objects.get(pk=self.product.pk).updated_at
        sync_summary_price(self.product)
        self.assertEqual(Product.objects.get(pk=self.product.pk).updated_at, before)


class PackageConstraintTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.product = _product(self.category, sku="FUR-000003")
        role = Role.objects.get(role_name="Customer")
        self.user = User.objects.create_user(
            email="buyer@example.com", full_name="Buyer", password="Str0ng!Passw0rd", role=role
        )

    def test_a_product_has_one_package_of_each_kind(self) -> None:
        _package(self.product, "whole", "10.00")
        with self.assertRaises(IntegrityError), transaction.atomic():
            _package(self.product, "whole", "12.00")

    def test_files_without_a_kind_are_not_limited(self) -> None:
        for name in ("a.fbx", "b.obj"):
            ProductFile.objects.create(
                product=self.product, file_name=name, file_format=name[-3:], file_size=1,
                storage_path=f"products/files/{name}",
            )
        self.assertEqual(self.product.files.filter(package_kind="").count(), 2)

    def test_a_preview_cannot_have_a_package_kind(self) -> None:
        with self.assertRaises(IntegrityError), transaction.atomic():
            ProductFile.objects.create(
                product=self.product, file_name="p.glb", file_format="glb", file_size=1,
                storage_path="models/FUR-000003/preview_FUR-000003.glb", is_preview=True,
                package_kind="whole",
            )

    def test_one_cart_holds_two_packages_of_one_model_but_not_the_same_one_twice(self) -> None:
        cart = Cart.objects.create(user=self.user)
        line = {"cart": cart, "product_type": "product", "product_id": self.product.pk, "quantity": 1}
        CartItem.objects.create(**line, package_kind="whole")
        CartItem.objects.create(**line, package_kind="glb_only")
        with self.assertRaises(IntegrityError), transaction.atomic():
            CartItem.objects.create(**line, package_kind="glb_only")

    def test_one_order_holds_two_packages_of_one_model_but_not_the_same_one_twice(self) -> None:
        order = Order.objects.create(user=self.user, invoice_number="INV-PKG-1", total_amount=Decimal("30.00"))
        line = {
            "order": order, "product_type": "product", "product_id": self.product.pk,
            "quantity": 1, "purchase_price": Decimal("15.00"),
        }
        OrderItem.objects.create(**line, package_kind="with_light_rig")
        OrderItem.objects.create(**line, package_kind="without_light_rig")
        with self.assertRaises(IntegrityError), transaction.atomic():
            OrderItem.objects.create(**line, package_kind="with_light_rig")


class CategoryCodeTests(TestCase):
    def test_two_categories_cannot_share_a_code(self) -> None:
        Category.objects.create(name="Electronics", slug="electronics", code="ELE")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Category.objects.create(name="Electric", slug="electric", code="ELE")

    def test_many_categories_can_have_no_code(self) -> None:
        Category.objects.create(name="One", slug="one")
        Category.objects.create(name="Two", slug="two")
        self.assertEqual(Category.objects.filter(code__isnull=True).count(), 2)

    def test_a_code_is_two_to_five_capital_letters(self) -> None:
        for code in ("ELE", "AB", "ABCDE"):
            with self.subTest(code=code):
                Category(name="Ok", slug=f"ok-{code.lower()}", code=code).full_clean()
        for code in ("ele", "A", "ABCDEF", "EL1", "E-L"):
            with self.subTest(code=code), self.assertRaises(ValidationError):
                Category(name="Bad", slug="bad", code=code).full_clean()

    def test_a_new_category_is_not_pending_and_not_from_an_import(self) -> None:
        category = Category.objects.create(name="Furniture", slug="furniture")
        self.assertFalse(category.pending_approval)
        self.assertFalse(category.created_by_import)
        self.assertEqual(category.created_from_batch, "")


class PackagesMigrationTests(TransactionTestCase):
    """0016 gives each old zip the Whole File kind and the product's price; cart lines follow."""

    # Apps this test does not migrate stay at their latest state (the database has it).
    unchanged = [
        ("accounts", "0013_admin_notifications"),
        ("categories", "0003_category_code_and_approval"),
    ]
    before = unchanged + [
        ("products", "0015_product_spin_images"),
        ("cart", "0003_remove_coupon_feature"),
        ("orders", "0004_orderitem_license"),
    ]
    after = unchanged + [
        ("products", "0016_packages"),
        ("cart", "0004_cartitem_package_kind"),
        ("orders", "0005_orderitem_package_kind"),
    ]

    def setUp(self) -> None:
        executor = MigrationExecutor(connection)
        executor.migrate(self.before)
        apps = executor.loader.project_state(self.before).apps
        Category = apps.get_model("categories", "Category")
        Product = apps.get_model("products", "Product")
        ProductFile = apps.get_model("products", "ProductFile")
        Role = apps.get_model("accounts", "Role")
        User = apps.get_model("accounts", "User")
        Cart = apps.get_model("cart", "Cart")
        CartItem = apps.get_model("cart", "CartItem")
        Order = apps.get_model("orders", "Order")
        OrderItem = apps.get_model("orders", "OrderItem")

        category = Category.objects.create(name="Furniture", slug="furniture")
        self.ends = timezone.now() + timedelta(days=2)

        def product(sku: str, status: str, price: str, path: str, **fields):
            row = Product.objects.create(
                category=category, name=sku, slug=sku.lower(), sku=sku, status=status,
                price=Decimal(price), **fields,
            )
            ProductFile.objects.create(
                product=row, file_name=path.rsplit("/", 1)[-1], file_format="zip",
                file_size=10, storage_path=path,
            )
            ProductFile.objects.create(
                product=row, file_name="p.glb", file_format="glb", file_size=1,
                storage_path=f"models/{sku}/preview_{sku}.glb", is_preview=True,
            )
            return row

        self.live = product(
            "FUR-000010", "published", "29.00", "models/FUR-000010/FUR-000010.zip",
            discount_price=Decimal("19.00"), discount_ends_at=self.ends,
        )
        self.waiting = product("FUR-000011", "awaiting_price", "0.00", "models/FUR-000011/package.zip")
        self.free = product("FUR-000012", "pending_review", "0.00", "free-models/FUR-000012/FUR-000012.zip")
        # An admin-upload product with two files: the newest zip becomes Whole File.
        self.mixed = product("FUR-000013", "published", "9.00", "models/FUR-000013/FUR-000013.zip")
        ProductFile.objects.create(
            product=self.mixed, file_name="extra.fbx", file_format="fbx", file_size=5,
            storage_path="products/files/extra.fbx",
        )

        role, _ = Role.objects.get_or_create(role_name="Customer")
        user = User.objects.create(email="old@example.com", full_name="Old", role=role)
        cart = Cart.objects.create(user=user)
        CartItem.objects.create(cart=cart, product_type="product", product_id=self.live.pk, quantity=1)
        CartItem.objects.create(cart=cart, product_type="plugin", product_id=self.free.pk, quantity=1)
        order = Order.objects.create(user=user, invoice_number="INV-OLD-1", total_amount=Decimal("19.00"))
        OrderItem.objects.create(
            order=order, product_type="product", product_id=self.live.pk, quantity=1,
            purchase_price=Decimal("19.00"),
        )

        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(self.after)
        self.apps = executor.loader.project_state(self.after).apps

    def tearDown(self) -> None:
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def _package(self, product) -> object:
        ProductFile = self.apps.get_model("products", "ProductFile")
        return ProductFile.objects.get(product_id=product.pk, is_preview=False, package_kind="whole")

    def test_a_priced_zip_becomes_whole_file_with_the_price_and_the_sale(self) -> None:
        package = self._package(self.live)
        self.assertEqual(package.price, Decimal("29.00"))
        self.assertEqual(package.discount_price, Decimal("19.00"))
        self.assertEqual(package.discount_ends_at, self.ends)

    def test_a_paid_model_waiting_at_zero_has_no_price(self) -> None:
        self.assertIsNone(self._package(self.waiting).price)

    def test_a_free_model_keeps_price_zero(self) -> None:
        self.assertEqual(self._package(self.free).price, Decimal("0.00"))

    def test_the_preview_keeps_no_kind_and_extra_files_keep_no_kind(self) -> None:
        ProductFile = self.apps.get_model("products", "ProductFile")
        self.assertFalse(ProductFile.objects.filter(is_preview=True).exclude(package_kind="").exists())
        self.assertEqual(self._package(self.mixed).storage_path, "models/FUR-000013/FUR-000013.zip")
        extra = ProductFile.objects.get(product_id=self.mixed.pk, file_format="fbx")
        self.assertEqual(extra.package_kind, "")

    def test_the_summary_price_already_matches_the_packages(self) -> None:
        Product = self.apps.get_model("products", "Product")
        for old in (self.live, self.waiting, self.free, self.mixed):
            row = Product.objects.get(pk=old.pk)
            self.assertEqual(
                (row.price, row.discount_price, row.discount_ends_at),
                (old.price, old.discount_price, old.discount_ends_at),
            )
            package = self._package(old)
            self.assertEqual(package.price if package.price is not None else Decimal("0.00"), row.price)

    def test_cart_product_lines_become_whole_file_and_order_lines_stay_blank(self) -> None:
        CartItem = self.apps.get_model("cart", "CartItem")
        OrderItem = self.apps.get_model("orders", "OrderItem")
        self.assertEqual(CartItem.objects.get(product_type="product").package_kind, "whole")
        self.assertEqual(CartItem.objects.get(product_type="plugin").package_kind, "")
        self.assertEqual(OrderItem.objects.get().package_kind, "")


class WholeFileIsNotSoldTests(SimpleTestCase):
    """Whole File is the zip All variations delivers: it is never a cart or order line of its
    own. These tests state that rule, and fail early if a test goes back to selling it."""

    def test_whole_file_is_not_a_kind_a_line_can_hold_or_a_cart_accepts(self) -> None:
        self.assertNotIn("whole", LINE_KINDS)
        self.assertNotIn("whole", SINGLE_KINDS)
        serializer = CartAddSerializer(
            data={"product_type": "product", "product_id": "5f1c6f0e-2f55-4d62-9f3e-0a9d6d1f2b11", "package_kind": "whole"}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("package_kind", serializer.errors)

    def test_no_test_sells_whole_file_by_hand(self) -> None:
        """A cart or order line in a test uses SOLD_PACKAGE_KIND (products.testing), never a
        hand-written "whole": when the sold kind changes, every test follows it from one place.
        Creating a Whole File zip row (ProductFile) or an old Whole File order line is fine."""
        backend = Path(__file__).resolve().parents[1]
        by_hand = re.compile(
            r'"package_kind":\s*"whole"'  # a cart or order payload
            r'|\(\s*"product",[^)]*,\s*"whole"\s*\)'  # a (type, id, kind) line key
            r'|add_item\([^)]*"whole"'  # CartService.add_item
        )
        offenders = []
        for path in sorted(backend.glob("*/test*.py")):
            if path == Path(__file__).resolve() or path.parent.name.startswith("."):
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if by_hand.search(line):
                    offenders.append(f"{path.relative_to(backend)}:{number}: {line.strip()}")
        message = "Sell SOLD_PACKAGE_KIND, not Whole File:\n" + "\n".join(offenders)
        self.assertEqual(offenders, [], message)
