import config.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("custom_projects", "0007_project_delivery_version_min"),
    ]

    operations = [
        migrations.AlterField(
            model_name="projectfile",
            name="storage_path",
            field=models.CharField(
                max_length=512,
                validators=[config.validators.validate_storage_path],
            ),
        ),
        migrations.AlterField(
            model_name="projectdelivery",
            name="storage_path",
            field=models.CharField(
                max_length=512,
                validators=[config.validators.validate_storage_path],
            ),
        ),
        migrations.AlterField(
            model_name="projectmessageattachment",
            name="storage_path",
            field=models.CharField(
                max_length=512,
                validators=[config.validators.validate_storage_path],
            ),
        ),
    ]
