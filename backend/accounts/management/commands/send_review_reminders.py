from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.notifications import overdue_notifications
from accounts.tasks import send_review_reminders_task
from config.celery_utils import enqueue_after_commit


class Command(BaseCommand):
    help = "Queue one-time reminders for models pending approval for at least 3 days."

    def handle(self, *args, **options):
        ids = [str(pk) for pk in overdue_notifications().values_list("pk", flat=True)]
        with transaction.atomic():
            for start in range(0, len(ids), 100):
                enqueue_after_commit(send_review_reminders_task, ids[start:start + 100])
        self.stdout.write(f"Queued reminders for {len(ids)} overdue models.")
