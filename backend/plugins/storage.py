"""Plugin-specific storage prefixes using the existing media storage implementation."""

from products.storage import ProductMediaStorageService


class PluginMediaStorageService(ProductMediaStorageService):
    IMAGE_PREFIX = "plugins/images/"
    FILE_PREFIX = "plugins/files/"
