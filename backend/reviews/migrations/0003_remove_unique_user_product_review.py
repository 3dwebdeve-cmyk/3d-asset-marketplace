from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("reviews", "0002_review_rating_nullable"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="review",
            name="unique_user_product_review",
        ),
    ]
