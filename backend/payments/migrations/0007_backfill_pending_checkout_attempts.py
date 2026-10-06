"""Preserve visibility of existing pending checkout sessions at rollout."""

import uuid

from django.db import migrations


def backfill(apps, schema_editor):
    Payment = apps.get_model("payments", "Payment")
    CheckoutAttempt = apps.get_model("payments", "CheckoutAttempt")
    alias = schema_editor.connection.alias
    for payment in Payment.objects.using(alias).filter(status="pending").iterator():
        attempt, created = CheckoutAttempt.objects.using(alias).get_or_create(
            order_id=payment.order_id,
            defaults={
                "idempotency_key": uuid.uuid4(),
                "status": "ready" if payment.checkout_url else "review",
                "stripe_checkout_session_id": payment.stripe_checkout_session_id,
                "checkout_url": payment.checkout_url,
            },
        )
        if created:
            CheckoutAttempt.objects.using(alias).filter(pk=attempt.pk).update(
                created_at=payment.created_at
            )


class Migration(migrations.Migration):
    dependencies = [("payments", "0006_alter_checkoutattempt_order")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
