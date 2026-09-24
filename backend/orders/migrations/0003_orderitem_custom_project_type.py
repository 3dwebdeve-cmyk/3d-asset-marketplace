from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0002_orderitem_title_slug"),
    ]

    operations = [
        migrations.AlterField(
            model_name="orderitem",
            name="product_type",
            field=models.CharField(
                choices=[
                    ("product", "Product"),
                    ("plugin", "Plugin"),
                    ("custom_project", "Custom project"),
                ],
                max_length=16,
            ),
        ),
    ]
