"""Sample side colours for gallery images stored before edge colours existed."""

from django.core.management.base import BaseCommand

from products.edge_colour import fetch_side_colours
from products.models import ProductImage


class Command(BaseCommand):
    help = (
        "Download each gallery image that has no side colours yet, sample its top side "
        "colours and save them. Images that cannot be fetched are skipped and can be "
        "run again later."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count the images that would be sampled without downloading or saving.",
        )

    def handle(self, *args, **options) -> None:
        pending = ProductImage.objects.filter(edge_left_color="").order_by("created_at")
        if options["dry_run"]:
            self.stdout.write(f"{pending.count()} image(s) without side colours.")
            return

        sampled = skipped = 0
        for image in pending.iterator():
            colours = fetch_side_colours(image.image_url)
            if colours is None:
                skipped += 1
                continue
            image.edge_left_color, image.edge_right_color = colours
            image.save(update_fields=["edge_left_color", "edge_right_color", "updated_at"])
            sampled += 1

        self.stdout.write(f"Sampled {sampled} image(s); skipped {skipped} that could not be read.")
