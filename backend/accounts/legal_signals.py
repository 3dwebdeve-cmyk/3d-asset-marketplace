"""Keep legal acceptance proof when an account is deleted."""

from __future__ import annotations

from typing import Any

from django.db.models.signals import pre_delete
from django.dispatch import receiver

from accounts.legal_service import keep_acceptances_for_deleted_user
from accounts.models import User


@receiver(pre_delete, sender=User, dispatch_uid="accounts.keep_legal_acceptances")
def keep_legal_acceptances(sender: type[User], instance: User, **kwargs: Any) -> None:
    # pre_delete also fires for each row of a queryset delete (Django admin bulk delete).
    keep_acceptances_for_deleted_user(instance)
