from django.core.management.base import BaseCommand, CommandError

from search.client import is_configured
from search.indexer import reindex_all


class Command(BaseCommand):
    help = (
        "Rebuild Meilisearch product and plugin indexes from published catalog rows. "
        "Requires MEILI_URL. Example: python manage.py reindex_search"
    )

    def handle(self, *args, **options) -> None:
        if not is_configured():
            raise CommandError("MEILI_URL is not set.")
        try:
            product_count, plugin_count = reindex_all()
        except Exception as exc:
            raise CommandError(f"Meilisearch reindex failed: {exc}") from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Indexed {product_count} products and {plugin_count} plugins."
            )
        )
