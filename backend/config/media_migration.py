"""Copy leftover local MEDIA_ROOT catalog files into R2 and rewrite public URLs."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.core.files.storage import Storage, default_storage
from django.db import transaction

from accounts.models import User
from config.media import is_public_media_path, media_relative_path
from config.storages import (
    build_public_media_url,
    get_private_storage,
    get_public_storage,
)
from plugins.models import Plugin, PluginFile, PluginImage
from products.models import Product, ProductFile, ProductImage

logger = logging.getLogger(__name__)


@dataclass
class MediaMigrationStats:
    copied: int = 0
    existed: int = 0
    missing: int = 0
    rewritten: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "copied": self.copied,
            "existed": self.existed,
            "missing": self.missing,
            "rewritten": self.rewritten,
            "skipped": self.skipped,
            "errors": list(self.errors),
        }


class MediaMigrationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class LocalMediaMigrationService:
    """Move leftover filesystem catalog objects to public/private R2 backends."""

    @classmethod
    def migrate(cls, *, dry_run: bool = False) -> MediaMigrationStats:
        if not getattr(settings, "R2_ENABLED", False):
            raise MediaMigrationError(
                "R2 is not enabled. Set all R2_* environment variables first."
            )

        stats = MediaMigrationStats()
        public = get_public_storage()
        private = get_private_storage()

        for product in Product.objects.all().iterator():
            cls._migrate_public_url_field(
                product, "thumbnail", public, stats, dry_run=dry_run
            )
            cls._migrate_public_url_field(
                product, "preview_model", public, stats, dry_run=dry_run
            )
        for image in ProductImage.objects.all().iterator():
            cls._migrate_public_url_field(
                image, "image_url", public, stats, dry_run=dry_run
            )
        for file_row in ProductFile.objects.all().iterator():
            cls._migrate_private_key(
                file_row.storage_path, private, stats, dry_run=dry_run
            )

        for plugin in Plugin.objects.all().iterator():
            cls._migrate_public_url_field(
                plugin, "thumbnail", public, stats, dry_run=dry_run
            )
        for image in PluginImage.objects.all().iterator():
            cls._migrate_public_url_field(
                image, "image_url", public, stats, dry_run=dry_run
            )
        for file_row in PluginFile.objects.all().iterator():
            cls._migrate_private_key(
                file_row.storage_path, private, stats, dry_run=dry_run
            )

        for user in User.objects.exclude(avatar="").iterator():
            cls._migrate_public_url_field(
                user, "avatar", public, stats, dry_run=dry_run
            )

        logger.info(
            "media_migration dry_run=%s copied=%s existed=%s missing=%s rewritten=%s skipped=%s",
            dry_run,
            stats.copied,
            stats.existed,
            stats.missing,
            stats.rewritten,
            stats.skipped,
        )
        return stats

    @classmethod
    def _migrate_public_url_field(
        cls,
        instance,
        field_name: str,
        dest: Storage,
        stats: MediaMigrationStats,
        *,
        dry_run: bool,
    ) -> None:
        current = str(getattr(instance, field_name) or "").strip()
        if not current:
            stats.skipped += 1
            return
        relative = media_relative_path(current)
        if relative is None or not is_public_media_path(relative):
            stats.skipped += 1
            return

        outcome = cls._copy_local(relative, dest, dry_run=dry_run)
        cls._count_copy(stats, outcome)
        if outcome == "error":
            stats.errors.append(relative)
            return

        new_url = build_public_media_url(relative)
        if current == new_url:
            return
        stats.rewritten += 1
        if dry_run:
            return
        setattr(instance, field_name, new_url)
        with transaction.atomic():
            instance.save(update_fields=[field_name, "updated_at"])

    @classmethod
    def _migrate_private_key(
        cls,
        storage_path: str,
        dest: Storage,
        stats: MediaMigrationStats,
        *,
        dry_run: bool,
    ) -> None:
        relative = media_relative_path(storage_path)
        if relative is None:
            stats.skipped += 1
            return
        outcome = cls._copy_local(relative, dest, dry_run=dry_run)
        cls._count_copy(stats, outcome)
        if outcome == "error":
            stats.errors.append(relative)

    @classmethod
    def _copy_local(cls, relative: str, dest: Storage, *, dry_run: bool) -> str:
        try:
            if dest.exists(relative):
                return "exists"
            if not default_storage.exists(relative):
                return "missing"
            if dry_run:
                return "copied"
            with default_storage.open(relative, "rb") as handle:
                dest.save(relative, handle)
            return "copied"
        except (OSError, ValueError):
            logger.exception("media_migration_copy_failed key=%s", relative)
            return "error"

    @staticmethod
    def _count_copy(stats: MediaMigrationStats, outcome: str) -> None:
        if outcome == "copied":
            stats.copied += 1
        elif outcome == "exists":
            stats.existed += 1
        elif outcome == "missing":
            stats.missing += 1
        elif outcome == "skipped":
            stats.skipped += 1
