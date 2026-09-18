from django.apps import AppConfig


class MailLogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mail_log"
    verbose_name = "Outbound email log"
