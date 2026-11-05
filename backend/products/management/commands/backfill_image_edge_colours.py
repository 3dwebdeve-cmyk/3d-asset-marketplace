"""Sample side colours for gallery images stored before edge colours existed."""

from django.core.management.base import BaseCommand

from products.edge_colour import edge_fields, fetch_side_colours
from products.models import ProductImage


class Command(BaseCommand):
    help = (
        "Download each gallery image that has no aspect ratio yet, sample its top side "
        "colours and aspect ratio and save them. Images that cannot be fetched are skipped "
        "and can be run again later."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count the images that would be sampled without downloading or saving.",
        )

    def handle(self, *args, **options) -> None:
        pending = ProductImage.objects.filter(aspect_ratio__isnull=True).order_by("created_at")
        if options["dry_run"]:
            self.stdout.write(f"{pending.count()} image(s) without side colours or aspect ratio.")
            return

        sampled = skipped = 0
        for image in pending.iterator():
            sample = fetch_side_colours(image.image_url)
            if sample is None:
                skipped += 1
                continue
            fields = edge_fields(sample)
            for name, value in fields.items():
                setattr(image, name, value)
            image.save(update_fields=[*fields, "updated_at"])
            sampled += 1

        self.stdout.write(f"Sampled {sampled} image(s); skipped {skipped} that could not be read.")
