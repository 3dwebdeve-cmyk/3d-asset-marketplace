from __future__ import annotations

from typing import Any

from django.conf import settings

# Placeholders from .env.example files and Meilisearch's historic default.
_EXAMPLE_MASTER_KEYS = {
    "dev_master_key_change_me",
    "change-me-meili-master-key-at-least-16-chars",
    "masterkey",
}


def is_configured() -> bool:
    return bool((getattr(settings, "MEILI_URL", "") or "").strip())


def is_required() -> bool:
    """When True, public search must use Meili (no silent Postgres fallback)."""
    return bool(getattr(settings, "MEILI_REQUIRED", False))


def get_client() -> Any:
    url = (getattr(settings, "MEILI_URL", "") or "").strip()
    if not url:
        return None
    import meilisearch

    key = (getattr(settings, "MEILI_MASTER_KEY", "") or "").strip() or None
    return meilisearch.Client(url, key)


def probe_meilisearch(client: Any) -> bool:
    """Return True when the Meilisearch instance reports healthy.

    Prefers ``client.is_healthy()`` (SDK); falls back to ``client.health()``.
    """
    is_healthy = getattr(client, "is_healthy", None)
    if callable(is_healthy):
        return bool(is_healthy())
    health = client.health()
    status_value = health.get("status") if isinstance(health, dict) else None
    return status_value in {"available", "ok"}


def master_key_is_weak(key: str | None = None) -> bool:
    """True when the master key is empty, shorter than 16 chars, or an example value."""
    raw = (key if key is not None else getattr(settings, "MEILI_MASTER_KEY", "") or "").strip()
    if len(raw) < 16:
        return True
    return raw.lower() in _EXAMPLE_MASTER_KEYS
