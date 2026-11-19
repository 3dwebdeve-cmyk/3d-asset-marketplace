"""Refuse to continue when a local run would reach real services."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Check the effective settings (environment plus backend/.env) before a local or E2E "
        "run: fail if the real Cloudflare R2 buckets or Sentry would be used. It prints "
        "yes/no only, never a key or bucket name. Turn them off with R2_FORCE_OFF=True and "
        "SENTRY_FORCE_OFF=True; blanking a value does not work on Windows. "
        "See docs/E2E_LOCAL.md."
    )

    def handle(self, *args, **options) -> None:
        problems = []
        if getattr(settings, "R2_ENABLED", False):
            problems.append(
                "R2 would use the real buckets. Set R2_FORCE_OFF=True for this run."
            )
        if getattr(settings, "SENTRY_DSN", ""):
            problems.append(
                "Sentry would send events to the real project. Set SENTRY_FORCE_OFF=True."
            )
        if problems:
            raise CommandError(" ".join(problems))
        self.stdout.write("Safe: R2 is off and Sentry is off.")
