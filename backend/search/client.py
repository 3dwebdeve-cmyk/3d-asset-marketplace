from __future__ import annotations

from typing import Any

from django.conf import settings


def is_configured() -> bool:
    return bool((getattr(settings, "MEILI_URL", "") or "").strip())


def get_client() -> Any:
    url = (getattr(settings, "MEILI_URL", "") or "").strip()
    if not url:
        return None
    import meilisearch

    key = (getattr(settings, "MEILI_MASTER_KEY", "") or "").strip() or None
    return meilisearch.Client(url, key)
