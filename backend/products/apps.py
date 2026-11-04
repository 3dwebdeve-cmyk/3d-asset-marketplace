import logging

from django.apps import AppConfig
from django.conf import settings

logger = logging.getLogger(__name__)


class ProductsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "products"

    def ready(self) -> None:
        warn_if_catalog_imports_unscanned()


def warn_if_catalog_imports_unscanned() -> None:
    """Say at startup that uploader previews go in unscanned. Never stops the site."""
    if (
        settings.PACKAGE_SCAN_REQUIRED
        and not settings.CATALOG_IMPORT_SCAN_REQUIRED
        and not settings.PACKAGE_SCAN_HOST
    ):
        logger.warning(
            "Catalog imports are accepted WITHOUT a virus scan (CATALOG_IMPORT_SCAN_REQUIRED=False)."
        )
