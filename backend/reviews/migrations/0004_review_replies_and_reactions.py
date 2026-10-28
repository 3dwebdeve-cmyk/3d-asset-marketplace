import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("reviews", "0003_remove_unique_user_product_review"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReviewReply",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("text", models.TextField(max_length=2000)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="children", to="reviews.reviewreply")),
                ("review", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="replies", to="reviews.review")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="review_replies", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "review_replies", "ordering": ["created_at"]},
        ),
        migrations.CreateModel(
            name="ReviewReaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("value", models.CharField(choices=[("like", "Like"), ("dislike", "Dislike")], max_length=8)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("review", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reactions", to="reviews.review")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="review_reactions", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "review_reactions"},
        ),
        migrations.AddConstraint(
            model_name="reviewreaction",
            constraint=models.UniqueConstraint(fields=("review", "user"), name="unique_review_user_reaction"),
        ),
    ]
