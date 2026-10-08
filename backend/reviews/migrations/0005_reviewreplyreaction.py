import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("reviews", "0004_review_replies_and_reactions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ReviewReplyReaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("value", models.CharField(choices=[("like", "Like"), ("dislike", "Dislike")], max_length=8)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("reply", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reactions", to="reviews.reviewreply")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="review_reply_reactions", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "review_reply_reactions"},
        ),
        migrations.AddConstraint(
            model_name="reviewreplyreaction",
            constraint=models.UniqueConstraint(fields=("reply", "user"), name="unique_review_reply_user_reaction"),
        ),
    ]
