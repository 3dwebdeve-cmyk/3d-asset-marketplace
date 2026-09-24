from django.db import migrations


class Migration(migrations.Migration):
    """Align live custom_project_messages table with the ProjectMessage model.

    An earlier draft schema was applied as 0002 on some local DBs (attachment_*
    columns, no updated_at). The current 0002 migration file expects updated_at
    and no attachment columns, so Django skipped CreateModel while the table
    stayed out of date.
    """

    dependencies = [
        ("custom_projects", "0002_project_messages"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE custom_project_messages
                        ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;
                    UPDATE custom_project_messages
                        SET updated_at = created_at
                        WHERE updated_at IS NULL;
                    ALTER TABLE custom_project_messages
                        ALTER COLUMN updated_at SET DEFAULT NOW();
                    ALTER TABLE custom_project_messages
                        ALTER COLUMN updated_at SET NOT NULL;
                    ALTER TABLE custom_project_messages
                        DROP COLUMN IF EXISTS attachment_path,
                        DROP COLUMN IF EXISTS attachment_name,
                        DROP COLUMN IF EXISTS attachment_size;
                    """,
                    reverse_sql="""
                    ALTER TABLE custom_project_messages
                        DROP COLUMN IF EXISTS updated_at;
                    ALTER TABLE custom_project_messages
                        ADD COLUMN IF NOT EXISTS attachment_path varchar(200),
                        ADD COLUMN IF NOT EXISTS attachment_name varchar(255),
                        ADD COLUMN IF NOT EXISTS attachment_size bigint DEFAULT 0;
                    """,
                ),
            ],
        ),
    ]
