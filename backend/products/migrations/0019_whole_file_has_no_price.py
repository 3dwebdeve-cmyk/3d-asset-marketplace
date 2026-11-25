from decimal import Decimal

from django.db import migrations

# The single packages in PACKAGE_ORDER's order, for the tie-break of the summary price.
SINGLE_ORDER = ["with_light_rig", "without_light_rig", "glb_only", "environment"]


def clear_whole_file_prices(apps, schema_editor):
    """With variations, All variations replaces the Whole File price: nobody prices Whole File
    there any more. A single-zip model (Whole File is its only zip) keeps its price: that zip is
    its one package.

    The Whole File prices of models that have variations are cleared, and each such model's
    summary price is recomputed from its variations (as products.packages.sync_summary_price does),
    so a Whole File price that was the cheapest is not left on the model.
    """
    Product = apps.get_model("products", "Product")
    ProductFile = apps.get_model("products", "ProductFile")
    with_variations = ProductFile.objects.filter(
        is_preview=False, package_kind__in=SINGLE_ORDER
    ).values("product_id")
    whole_rows = (
        ProductFile.objects.filter(package_kind="whole", product_id__in=with_variations)
        .exclude(price__isnull=True)
    )
    product_ids = set(whole_rows.values_list("product_id", flat=True))
    whole_rows.update(price=None, discount_price=None, discount_ends_at=None)
    for product in Product.objects.filter(pk__in=product_ids):
        priced = list(
            ProductFile.objects.filter(product=product, is_preview=False)
            .exclude(package_kind__in=["", "whole"])
            .exclude(price__isnull=True)
        )
        cheapest = min(
            priced,
            key=lambda row: (row.price, SINGLE_ORDER.index(row.package_kind)),
            default=None,
        )
        if cheapest is None:
            product.price, product.discount_price, product.discount_ends_at = Decimal("0.00"), None, None
        else:
            product.price = cheapest.price
            product.discount_price = cheapest.discount_price
            product.discount_ends_at = cheapest.discount_ends_at
        product.save(update_fields=["price", "discount_price", "discount_ends_at"])


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0018_remove_pricing_setup'),
    ]

    operations = [
        migrations.RunPython(clear_whole_file_prices, migrations.RunPython.noop),
    ]
