from django.apps import AppConfig


class CustomProjectsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "custom_projects"
    verbose_name = "Custom Projects"
