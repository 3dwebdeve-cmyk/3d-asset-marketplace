from django.db import migrations


def seed_role(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    Role.objects.get_or_create(
        role_name="Catalog Uploader",
        defaults={"description": "Service account for the catalog uploader API key"},
    )


def remove_role(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    Role.objects.filter(role_name="Catalog Uploader", users__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0009_catalog_api_key"),
    ]

    operations = [
        migrations.RunPython(seed_role, remove_role),
    ]
