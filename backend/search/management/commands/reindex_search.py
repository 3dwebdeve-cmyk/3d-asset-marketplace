from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "No-op: catalog search uses Postgres. Meilisearch indexing was removed."
    )

    def handle(self, *args, **options) -> None:
        self.stdout.write(
            self.style.SUCCESS(
                "Search uses Postgres icontains; reindex_search is a no-op."
            )
        )
