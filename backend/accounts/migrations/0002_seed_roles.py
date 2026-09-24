from django.db import migrations


def seed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    roles = [
        ("Administrator", "Platform administrator"),
        ("Customer", "Marketplace customer"),
    ]
    for role_name, description in roles:
        Role.objects.get_or_create(
            role_name=role_name,
            defaults={"description": description},
        )


def remove_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    Role.objects.filter(role_name__in=["Administrator", "Customer"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_roles, remove_roles),
    ]
