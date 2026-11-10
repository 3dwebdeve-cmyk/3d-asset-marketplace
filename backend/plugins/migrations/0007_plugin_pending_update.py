from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('plugins', '0006_plugin_review_pipeline'),
    ]

    operations = [
        migrations.AddField(
            model_name='plugin',
            name='pending_update',
            field=models.BooleanField(default=False),
        ),
    ]
