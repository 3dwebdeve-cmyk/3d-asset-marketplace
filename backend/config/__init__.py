"""Load the Celery app so ``shared_task`` binds when Django starts."""

from .celery import app as celery_app

__all__ = ("celery_app",)
