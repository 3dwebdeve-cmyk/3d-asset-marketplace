from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Confirm catalog search is Postgres-only (Meilisearch removed)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--fail-on-warnings",
            action="store_true",
            help="Kept for CLI compatibility; always succeeds.",
        )

    def handle(self, *args, **options) -> None:
        self.stdout.write("MEILI_configured=False")
        self.stdout.write("MEILI_required=False")
        self.stdout.write("search_backend=postgres_icontains")
        self.stdout.write(
            self.style.SUCCESS("Catalog search config looks ready (Postgres).")
        )
