import config.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0004_product_qa_statuses"),
    ]

    operations = [
        migrations.AlterField(
            model_name="productfile",
            name="storage_path",
            field=models.CharField(
                max_length=512,
                validators=[config.validators.validate_storage_path],
            ),
        ),
    ]
