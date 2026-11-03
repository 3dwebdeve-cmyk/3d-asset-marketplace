from decimal import Decimal
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from accounts.models import Role, User
from plugins.models import Plugin, PluginCategory, PluginFile
from plugins.services import PluginCreateData, PluginError, PluginService, PluginUpdateData


class PluginReviewServiceTests(TestCase):
    def setUp(self) -> None:
        self.category = PluginCategory.objects.create(
            name="Animation", slug="animation", code="ANI"
        )
        self.reviewer = User.objects.create_user(
            email="plugin-reviewer@example.com",
            full_name="Plugin Reviewer",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )

    def make_pending(self, **overrides) -> Plugin:
        values = {
            "category": self.category,
            "name": "Rig Helper",
            "slug": "rig-helper",
            "plugin_id": "PLG-ANI-000001",
            "description": "Helps with rigs.",
            "thumbnail": "https://cdn.example.com/rig.webp",
            "price": Decimal("0.00"),
            "import_batch_id": "batch-1",
            "status": Plugin.Status.PENDING_REVIEW,
        }
        values.update(overrides)
        plugin = Plugin.objects.create(**values)
        PluginFile.objects.create(
            plugin=plugin,
            file_name="PLG-ANI-000001.zip",
            file_format="zip",
            file_size=10,
            storage_path="plugins/PLG-ANI-000001/PLG-ANI-000001.zip",
            is_primary=True,
        )
        return plugin

    def approve(self, plugin: Plugin, **kwargs) -> Plugin:
        kwargs.setdefault("price", Decimal("19.00"))
        with patch("plugins.services.private_object_exists", return_value=True):
            return PluginService.approve_plugin(plugin, reviewer=self.reviewer, **kwargs)

    def test_approve_publishes_and_sets_price_and_reviewer(self) -> None:
        plugin = self.make_pending(reject_reason="old")
        approved = self.approve(plugin, qa_notes=" looks good ")

        self.assertEqual(approved.status, Plugin.Status.PUBLISHED)
        self.assertEqual(approved.price, Decimal("19.00"))
        self.assertEqual(approved.reviewed_by, self.reviewer)
        self.assertIsNotNone(approved.reviewed_at)
        self.assertEqual(approved.reject_reason, "")
        self.assertEqual(approved.qa_notes, "looks good")

    def test_approve_with_zero_price_makes_plugin_free(self) -> None:
        approved = self.approve(self.make_pending(), price=Decimal("0.00"))
        self.assertEqual(approved.status, Plugin.Status.PUBLISHED)
        self.assertEqual(approved.price, Decimal("0.00"))

    def test_approve_rejects_negative_price_and_keeps_pending(self) -> None:
        plugin = self.make_pending()
        with self.assertRaises(PluginError):
            self.approve(plugin, price=Decimal("-1.00"))
        plugin.refresh_from_db()
        self.assertEqual(plugin.status, Plugin.Status.PENDING_REVIEW)

    def test_approve_rejects_discount_above_price(self) -> None:
        with self.assertRaises(PluginError) as ctx:
            self.approve(
                self.make_pending(),
                price=Decimal("10.00"),
                discount_price=Decimal("12.00"),
            )
        self.assertEqual(ctx.exception.field, "discount_price")

    def test_approve_requires_pending_review(self) -> None:
        for status in (
            Plugin.Status.DRAFT,
            Plugin.Status.PUBLISHED,
            Plugin.Status.REJECTED,
            Plugin.Status.ARCHIVED,
        ):
            with self.subTest(status=status):
                plugin = self.make_pending(
                    status=status, slug=f"p-{status}", plugin_id=None
                )
                with self.assertRaises(PluginError) as ctx:
                    self.approve(plugin)
                self.assertEqual(ctx.exception.field, "status")

    def test_approve_gates_missing_content(self) -> None:
        cases = {
            "plugin_id": {"plugin_id": None},
            "description": {"description": "  "},
            "thumbnail": {"thumbnail": ""},
        }
        for field, override in cases.items():
            with self.subTest(field=field):
                plugin = self.make_pending(slug=f"gate-{field}", **override)
                if "plugin_id" not in override:
                    plugin.plugin_id = f"PLG-ANI-9{len(field):05d}"
                    plugin.save(update_fields=["plugin_id"])
                with self.assertRaises(PluginError) as ctx:
                    self.approve(plugin)
                self.assertIn(field, ctx.exception.message)
                plugin.refresh_from_db()
                self.assertEqual(plugin.status, Plugin.Status.PENDING_REVIEW)

    def test_approve_gates_inactive_category(self) -> None:
        plugin = self.make_pending()
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])
        with self.assertRaises(PluginError) as ctx:
            self.approve(plugin)
        self.assertIn("category", ctx.exception.message)

    def test_approve_gates_missing_package(self) -> None:
        plugin = self.make_pending()
        plugin.files.all().delete()
        with self.assertRaises(PluginError) as ctx:
            self.approve(plugin)
        self.assertIn("files", ctx.exception.message)

    def test_approve_gates_package_missing_from_storage(self) -> None:
        plugin = self.make_pending()
        with patch("plugins.services.private_object_exists", return_value=False):
            with self.assertRaises(PluginError) as ctx:
                PluginService.approve_plugin(
                    plugin, reviewer=self.reviewer, price=Decimal("5.00")
                )
        self.assertIn("files", ctx.exception.message)

    def test_reject_stores_reason_and_reviewer(self) -> None:
        plugin = self.make_pending()
        rejected = PluginService.reject_plugin(
            plugin, reviewer=self.reviewer, reason=" broken zip ", qa_notes="n"
        )
        self.assertEqual(rejected.status, Plugin.Status.REJECTED)
        self.assertEqual(rejected.reject_reason, "broken zip")
        self.assertEqual(rejected.qa_notes, "n")
        self.assertEqual(rejected.reviewed_by, self.reviewer)

    def test_reject_requires_reason_and_pending_status(self) -> None:
        plugin = self.make_pending()
        with self.assertRaises(PluginError) as ctx:
            PluginService.reject_plugin(plugin, reviewer=self.reviewer, reason="  ")
        self.assertEqual(ctx.exception.field, "reason")
        plugin.status = Plugin.Status.PUBLISHED
        plugin.save(update_fields=["status"])
        with self.assertRaises(PluginError):
            PluginService.reject_plugin(plugin, reviewer=self.reviewer, reason="x")

    def test_requeue_moves_rejected_back_to_pending(self) -> None:
        plugin = self.make_pending()
        rejected = PluginService.reject_plugin(
            plugin, reviewer=self.reviewer, reason="fix it"
        )
        requeued = PluginService.requeue_plugin(rejected)
        self.assertEqual(requeued.status, Plugin.Status.PENDING_REVIEW)
        self.assertEqual(requeued.reject_reason, "fix it")
        with self.assertRaises(PluginError):
            PluginService.requeue_plugin(requeued)

    def test_plain_edit_cannot_publish_or_enter_review_states(self) -> None:
        plugin = self.make_pending()
        for target in (Plugin.Status.PUBLISHED, Plugin.Status.REJECTED):
            with self.subTest(target=target):
                with self.assertRaises(PluginError):
                    PluginService.update_plugin(
                        plugin, PluginUpdateData(status=target)
                    )
        draft = self.make_pending(
            status=Plugin.Status.DRAFT, slug="draft", plugin_id=None
        )
        with self.assertRaises(PluginError):
            PluginService.update_plugin(
                draft, PluginUpdateData(status=Plugin.Status.PENDING_REVIEW)
            )

    def test_imported_draft_cannot_publish_through_plain_edit(self) -> None:
        plugin = self.make_pending(
            status=Plugin.Status.DRAFT, slug="imported-draft", plugin_id=None
        )
        with self.assertRaises(PluginError):
            PluginService.update_plugin(
                plugin, PluginUpdateData(status=Plugin.Status.PUBLISHED)
            )

    def test_archive_is_allowed_from_pending_review(self) -> None:
        archived = PluginService.archive_plugin(self.make_pending())
        self.assertEqual(archived.status, Plugin.Status.ARCHIVED)

    def test_create_cannot_start_in_review_states(self) -> None:
        for status in (Plugin.Status.PENDING_REVIEW, Plugin.Status.REJECTED):
            with self.subTest(status=status):
                with self.assertRaises(PluginError):
                    PluginService.create_plugin(
                        PluginCreateData(
                            category_id=self.category.pk,
                            name="Direct",
                            price=Decimal("1.00"),
                            status=status,
                        )
                    )

    def test_pending_and_rejected_plugins_are_not_public(self) -> None:
        pending = self.make_pending()
        self.make_pending(
            status=Plugin.Status.REJECTED, slug="rejected", plugin_id="PLG-ANI-000002"
        )
        self.assertFalse(PluginService.list_public().exists())
        with self.assertRaises(PluginError):
            PluginService.get_public_by_slug(pending.slug)
        self.assertEqual(
            PluginService.list_admin(status=Plugin.Status.PENDING_REVIEW).count(), 1
        )


class PluginIdentityFieldTests(TestCase):
    def setUp(self) -> None:
        self.category = PluginCategory.objects.create(
            name="Rendering", slug="rendering", code="REN"
        )

    def test_plugin_id_must_match_format(self) -> None:
        for bad in ("PLG-ANI-1", "plg-ani-000001", "MDL-ANI-000001", "PLG-AN-000001"):
            with self.subTest(plugin_id=bad):
                plugin = Plugin(
                    category=self.category,
                    name="X Plugin",
                    slug=f"x-{bad}",
                    plugin_id=bad,
                    price=Decimal("0.00"),
                )
                with self.assertRaises(ValidationError):
                    plugin.full_clean()

    def test_plugin_id_is_unique_but_blank_ids_repeat(self) -> None:
        Plugin.objects.create(
            category=self.category, name="One", slug="one",
            plugin_id="PLG-REN-000001", price=Decimal("0.00"),
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Plugin.objects.create(
                category=self.category, name="Two", slug="two",
                plugin_id="PLG-REN-000001", price=Decimal("0.00"),
            )
        for slug in ("three", "four"):
            Plugin.objects.create(
                category=self.category, name=slug, slug=slug, price=Decimal("0.00")
            )

    def test_category_code_is_three_uppercase_letters_and_unique(self) -> None:
        for bad in ("re", "RENX", "r3n"):
            with self.subTest(code=bad):
                category = PluginCategory(name=f"C {bad}", slug=f"c-{bad}", code=bad)
                with self.assertRaises(ValidationError):
                    category.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            PluginCategory.objects.create(name="Dup", slug="dup", code="REN")
        PluginCategory.objects.create(name="No code A", slug="no-code-a")
        PluginCategory.objects.create(name="No code B", slug="no-code-b")
