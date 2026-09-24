import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("custom_projects", "0004_project_message_read_state"),
    ]

    operations = [
        migrations.AlterField(
            model_name="projectmessage",
            name="body",
            field=models.TextField(blank=True, max_length=5000),
        ),
        migrations.CreateModel(
            name="ProjectMessageAttachment",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("file_name", models.CharField(max_length=255)),
                ("storage_path", models.URLField()),
                ("file_size", models.PositiveBigIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "message",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attachments",
                        to="custom_projects.projectmessage",
                    ),
                ),
            ],
            options={
                "db_table": "custom_project_message_attachments",
                "ordering": ["created_at"],
                "indexes": [
                    models.Index(
                        fields=["message", "created_at"],
                        name="custom_proj_message_6f2a1c_idx",
                    ),
                ],
            },
        ),
    ]
