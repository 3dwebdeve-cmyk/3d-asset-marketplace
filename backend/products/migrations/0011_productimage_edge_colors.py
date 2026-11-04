from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0010_merge_material_texture_and_package_formats'),
    ]

    operations = [
        migrations.AddField(
            model_name='productimage',
            name='edge_left_color',
            field=models.CharField(blank=True, default='', max_length=7),
        ),
        migrations.AddField(
            model_name='productimage',
            name='edge_right_color',
            field=models.CharField(blank=True, default='', max_length=7),
        ),
    ]
