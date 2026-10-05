from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self) -> None:
        # Register Phase A2 deploy security checks (config.E001 / E002 / W001).
        from config import deploy_checks  # noqa: F401
        from config import schema  # noqa: F401
