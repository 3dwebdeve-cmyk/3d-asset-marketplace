from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0013_admin_notifications"),
    ]

    operations = [
        migrations.AddField(
            model_name="usersession",
            name="step_up_until",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
