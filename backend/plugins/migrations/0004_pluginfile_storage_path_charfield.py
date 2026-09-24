import config.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("plugins", "0003_add_reviews_and_review_count"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pluginfile",
            name="storage_path",
            field=models.CharField(
                max_length=512,
                validators=[config.validators.validate_storage_path],
            ),
        ),
    ]
