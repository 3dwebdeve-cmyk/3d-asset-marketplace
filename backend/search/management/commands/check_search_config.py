"""Report Meilisearch readiness: URL, required flag, master-key strength, health."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from search.client import (
    get_client,
    is_configured,
    is_required,
    master_key_is_weak,
    probe_meilisearch,
)


class Command(BaseCommand):
    help = (
        "Print Meilisearch configuration used by healthz and public catalog search. "
        "Pass --fail-on-warnings to exit non-zero when search would be unhealthy "
        "in this environment."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Exit 1 when launch-blocking search issues are detected.",
        )

    def handle(self, *args, **options) -> None:
        configured = is_configured()
        required = is_required()
        url = (getattr(settings, "MEILI_URL", "") or "").strip() or "(empty)"
        key = (getattr(settings, "MEILI_MASTER_KEY", "") or "").strip()
        weak_key = master_key_is_weak(key)
        warnings: list[str] = []

        self.stdout.write(f"DEBUG={settings.DEBUG}")
        self.stdout.write(f"MEILI_URL={url}")
        self.stdout.write(f"MEILI_REQUIRED={required}")
        self.stdout.write(f"MEILI_configured={configured}")
        self.stdout.write(f"MEILI_MASTER_KEY_length={len(key)}")
        self.stdout.write(f"MEILI_MASTER_KEY_weak={weak_key}")
        self.stdout.write(
            "Compose MEILI_ENV should be production "
            "(meilisearch service; not a Django setting)."
        )

        if required and not configured:
            warnings.append(
                "MEILI_REQUIRED is true but MEILI_URL is empty — "
                "healthz and public search will fail."
            )
        elif configured:
            try:
                client = get_client()
                if client is None:
                    raise RuntimeError("meilisearch client unavailable")
                healthy = probe_meilisearch(client)
            except Exception as exc:
                healthy = False
                warnings.append(f"Meilisearch probe failed: {exc}")
            self.stdout.write(f"MEILI_healthy={healthy}")
            if not healthy and "Meilisearch probe failed" not in " ".join(warnings):
                warnings.append(
                    "Meilisearch is configured but not healthy — "
                    "fix the service, then run: python manage.py reindex_search"
                )
        else:
            self.stdout.write("MEILI_healthy=skipped")
            if not required:
                self.stdout.write(
                    "Public search will use PostgreSQL icontains fallback "
                    "(DEBUG local DX)."
                )

        if (configured or required) and weak_key:
            warnings.append(
                "MEILI_MASTER_KEY is empty, shorter than 16 characters, or an "
                "example placeholder — set a unique key (at least 16 chars) and match "
                "the meilisearch service MEILI_MASTER_KEY."
            )

        self.stdout.write(
            "After Meili is healthy, rebuild indexes: python manage.py reindex_search"
        )

        if not warnings:
            self.stdout.write(self.style.SUCCESS("Search config looks ready for this env."))
            return

        for warning in warnings:
            self.stdout.write(self.style.ERROR(warning))
        if options["fail_on_warnings"]:
            raise CommandError(
                f"Search config has {len(warnings)} issue(s). See messages above."
            )
