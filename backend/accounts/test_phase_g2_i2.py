"""Phase I2 / G2 — check_ops_config and drop_legacy_notifications_table."""

from __future__ import annotations

from io import StringIO
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings


class CheckOpsConfigTests(SimpleTestCase):
    @override_settings(
        DEBUG=True,
        CONTACT_ADMIN_RECIPIENTS="",
        PROJECT_MESSAGE_ADMIN_RECIPIENTS="",
    )
    @patch("accounts.management.commands.check_ops_config.User")
    def test_debug_allows_empty_recipients(self, user_model: MagicMock) -> None:
        user_model.objects.filter.return_value.count.return_value = 1
        out = StringIO()
        call_command("check_ops_config", fail_on_warnings=True, stdout=out)
        self.assertIn("looks ready", out.getvalue())

    @override_settings(
        DEBUG=False,
        CONTACT_ADMIN_RECIPIENTS="",
        PROJECT_MESSAGE_ADMIN_RECIPIENTS="ops@example.com",
    )
    @patch("accounts.management.commands.check_ops_config.User")
    def test_fail_when_contact_missing_in_prod(self, user_model: MagicMock) -> None:
        user_model.objects.filter.return_value.count.return_value = 1
        with self.assertRaises(CommandError):
            call_command("check_ops_config", fail_on_warnings=True)


class DropLegacyNotificationsTests(SimpleTestCase):
    @patch("accounts.management.commands.drop_legacy_notifications_table.connection")
    def test_reports_absent(self, connection: MagicMock) -> None:
        connection.introspection.table_names.return_value = ["orders_order"]
        out = StringIO()
        call_command("drop_legacy_notifications_table", stdout=out)
        self.assertIn("notifications_table_present=False", out.getvalue())
        self.assertIn("already complete", out.getvalue())
