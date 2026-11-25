from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0005_orderitem_package_kind'),
    ]

    operations = [
        migrations.AlterField(
            model_name='orderitem',
            name='package_kind',
            field=models.CharField(blank=True, choices=[('with_light_rig', 'With Light Rig'), ('without_light_rig', 'Without Light Rig'), ('glb_only', 'GLB Only'), ('environment', 'With Environment'), ('whole', 'Whole File'), ('bundle', 'All variations')], default='', max_length=32),
        ),
    ]
