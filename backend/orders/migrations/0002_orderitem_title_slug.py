from django.db import migrations, models


def backfill_order_item_snapshots(apps, schema_editor):
    OrderItem = apps.get_model("orders", "OrderItem")
    Product = apps.get_model("products", "Product")
    Plugin = apps.get_model("plugins", "Plugin")

    product_ids = list(
        OrderItem.objects.filter(product_type="product", title__isnull=True)
        .values_list("product_id", flat=True)
        .distinct()
    )
    plugin_ids = list(
        OrderItem.objects.filter(product_type="plugin", title__isnull=True)
        .values_list("product_id", flat=True)
        .distinct()
    )

    products = {
        row["id"]: (row["name"], row["slug"])
        for row in Product.objects.filter(pk__in=product_ids).values("id", "name", "slug")
    }
    plugins = {
        row["id"]: (row["name"], row["slug"])
        for row in Plugin.objects.filter(pk__in=plugin_ids).values("id", "name", "slug")
    }

    updates: list = []
    for item in OrderItem.objects.filter(title__isnull=True).iterator(chunk_size=500):
        if item.product_type == "product":
            snapshot = products.get(item.product_id)
        elif item.product_type == "plugin":
            snapshot = plugins.get(item.product_id)
        else:
            snapshot = None
        if not snapshot:
            continue
        item.title, item.slug = snapshot
        updates.append(item)
        if len(updates) >= 500:
            OrderItem.objects.bulk_update(updates, ["title", "slug"])
            updates.clear()
    if updates:
        OrderItem.objects.bulk_update(updates, ["title", "slug"])


class Migration(migrations.Migration):
    dependencies = [
        ("orders", "0001_initial"),
        ("products", "0001_initial"),
        ("plugins", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="title",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="slug",
            field=models.SlugField(blank=True, max_length=255, null=True),
        ),
        migrations.RunPython(backfill_order_item_snapshots, migrations.RunPython.noop),
    ]
