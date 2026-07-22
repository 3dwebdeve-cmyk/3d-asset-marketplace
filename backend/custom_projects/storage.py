"""Custom project reference-file storage using the shared media storage backend."""

from products.storage import ProductMediaStorageService


class ProjectFileStorageService(ProductMediaStorageService):
    FILE_PREFIX = "custom_projects/files/"
